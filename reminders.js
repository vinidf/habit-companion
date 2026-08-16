(() => {
  const SETTINGS_DB = 'habit-companion-reminders';
  const SETTINGS_STORE = 'settings';
  const DEFAULT_TIME = '21:00';
  const SYNC_TAG = 'habit-companion-reminder';
  let reminderTimer = null;
  let reminderPoller = null;

  function openSettingsDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(SETTINGS_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getSetting(key, fallback) {
    const db = await openSettingsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readonly');
      const request = tx.objectStore(SETTINGS_STORE).get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : fallback);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  }

  async function setSetting(key, value) {
    const db = await openSettingsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readwrite');
      tx.objectStore(SETTINGS_STORE).put({ key, value });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function startOfWeek(date = new Date()) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    const day = copy.getDay();
    copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
    return copy;
  }

  function endOfWeek(date = new Date()) {
    const end = startOfWeek(date);
    end.setDate(end.getDate() + 6);
    return end;
  }

  function minutesFor(time) {
    const [hours, minutes] = String(time || DEFAULT_TIME).split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  }

  function nowMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  async function getHabitData() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('habit-companion');
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('habits') || !db.objectStoreNames.contains('completions')) {
          db.close();
          resolve({ habits: [], completions: [] });
          return;
        }
        const tx = db.transaction(['habits', 'completions'], 'readonly');
        const habitRequest = tx.objectStore('habits').getAll();
        const completionRequest = tx.objectStore('completions').getAll();
        tx.oncomplete = () => {
          db.close();
          resolve({ habits: habitRequest.result || [], completions: completionRequest.result || [] });
        };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function pendingCount() {
    const { habits, completions } = await getHabitData();
    const now = new Date();
    const today = localDateKey(now);
    const weekStart = localDateKey(startOfWeek(now));
    const weekEnd = localDateKey(endOfWeek(now));
    const todayDone = new Set(completions.filter(item => item.date === today).map(item => item.habitId));
    const weekCounts = new Map();
    completions.forEach(item => {
      if (item.date >= weekStart && item.date <= weekEnd) weekCounts.set(item.habitId, (weekCounts.get(item.habitId) || 0) + 1);
    });
    return habits.filter(habit => {
      if (todayDone.has(habit.id)) return false;
      if (habit.frequency === 'daily') return true;
      if (habit.frequency === 'scheduled') return Array.isArray(habit.days) && habit.days.includes(now.getDay());
      const ideal = Math.max(1, Number(habit.idealPerWeek || 1));
      return (weekCounts.get(habit.id) || 0) < ideal;
    }).length;
  }

  async function showReminder(count, test = false) {
    const registration = await navigator.serviceWorker.ready;
    const body = test
      ? count > 0
        ? `${count} habit${count === 1 ? ' is' : 's are'} pending right now. Reminders can be shown on this device.`
        : 'Nothing is pending right now. Notifications are working.'
      : count === 1
        ? '1 habit is still pending today. Open Habit Companion to check it off.'
        : `${count} habits are still pending today. Open Habit Companion to check them off.`;
    await registration.showNotification(test ? 'Habit Companion reminder check' : 'A quick check before the day ends', {
      body,
      icon: './icon.svg',
      tag: test ? `habit-companion-reminder-test-${Date.now()}` : 'habit-companion-daily-reminder',
      renotify: false,
      data: { url: './' }
    });
  }

  async function maybeNotify() {
    if (!(await getSetting('enabled', false))) return false;
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const time = await getSetting('time', DEFAULT_TIME);
    if (nowMinutes() < minutesFor(time)) return false;
    const today = localDateKey();
    if ((await getSetting('lastNotifiedDate', '')) === today) return false;
    const count = await pendingCount();
    await setSetting('lastCheckedAt', new Date().toISOString());
    if (count <= 0) return false;
    await showReminder(count);
    await setSetting('lastNotifiedDate', today);
    return true;
  }

  async function scheduleForegroundReminder() {
    if (reminderTimer) clearTimeout(reminderTimer);
    reminderTimer = null;
    if (!(await getSetting('enabled', false))) return;
    const time = await getSetting('time', DEFAULT_TIME);
    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    const delay = Math.max(1000, target.getTime() - now.getTime());
    reminderTimer = setTimeout(async () => {
      try { await maybeNotify(); } catch {}
      scheduleForegroundReminder();
    }, delay);
  }

  function startForegroundPolling() {
    if (reminderPoller) clearInterval(reminderPoller);
    reminderPoller = setInterval(() => {
      if (document.visibilityState === 'visible') maybeNotify().catch(() => {});
    }, 60 * 1000);
  }

  async function registerPeriodicCheck(enabled) {
    if (!('serviceWorker' in navigator)) return { supported: false, registered: false };
    const registration = await navigator.serviceWorker.ready;
    if (!('periodicSync' in registration)) return { supported: false, registered: false };
    try {
      if (enabled) await registration.periodicSync.register(SYNC_TAG, { minInterval: 24 * 60 * 60 * 1000 });
      else await registration.periodicSync.unregister(SYNC_TAG);
      const tags = await registration.periodicSync.getTags();
      return { supported: true, registered: tags.includes(SYNC_TAG) };
    } catch {
      return { supported: true, registered: false };
    }
  }

  async function backgroundStatus() {
    if (!('serviceWorker' in navigator)) return { supported: false, registered: false };
    try {
      const registration = await navigator.serviceWorker.ready;
      if (!('periodicSync' in registration)) return { supported: false, registered: false };
      const tags = await registration.periodicSync.getTags();
      return { supported: true, registered: tags.includes(SYNC_TAG) };
    } catch {
      return { supported: false, registered: false };
    }
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `.reminder-settings{margin-top:18px;padding:16px;border:1px solid var(--line);border-radius:18px;background:#f8faff}.reminder-heading{display:flex;align-items:center;justify-content:space-between;gap:14px}.reminder-heading strong{display:block;font-size:14px}.reminder-heading p{margin:4px 0 0;color:var(--muted);font-size:12px;line-height:1.4}.reminder-switch{position:relative;width:48px;height:28px;flex:0 0 auto}.reminder-switch input{position:absolute;opacity:0;pointer-events:none}.reminder-switch span{position:absolute;inset:0;border-radius:99px;background:#dce3ee;transition:.18s}.reminder-switch span::after{content:"";position:absolute;width:22px;height:22px;left:3px;top:3px;border-radius:50%;background:white;box-shadow:0 2px 8px rgba(30,50,80,.2);transition:.18s}.reminder-switch input:checked+span{background:var(--primary)}.reminder-switch input:checked+span::after{transform:translateX(20px)}.reminder-time-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:15px}.reminder-time-row label{font-size:13px;font-weight:800}.reminder-time{border:1px solid var(--line);background:white;color:var(--ink);border-radius:12px;padding:9px 11px;min-height:40px}.reminder-status{margin:10px 0 0;color:var(--muted);font-size:11px;line-height:1.45}.reminder-capability{margin-top:10px;padding:10px 12px;border-radius:12px;background:white;border:1px solid var(--line);font-size:11px;line-height:1.4}.reminder-capability.good{color:var(--success)}.reminder-capability.limited{color:var(--warning)}.reminder-actions{margin-top:12px}.reminder-test{width:100%;border:0;border-radius:12px;background:#eef3fb;color:var(--primary-deep);padding:10px;font-size:12px;font-weight:800;cursor:pointer}`;
    document.head.appendChild(style);
  }

  async function refreshUI() {
    const enabled = await getSetting('enabled', false);
    const time = await getSetting('time', DEFAULT_TIME);
    const toggle = document.getElementById('reminderEnabled');
    const timeInput = document.getElementById('reminderTime');
    const status = document.getElementById('reminderStatus');
    const capability = document.getElementById('reminderCapability');
    if (!toggle || !timeInput || !status || !capability) return;
    toggle.checked = enabled;
    timeInput.value = time;
    timeInput.disabled = !enabled;
    if (!('Notification' in window)) {
      status.textContent = 'Notifications are not supported by this browser.';
      capability.textContent = 'This browser cannot deliver Habit Companion notifications.';
      capability.className = 'reminder-capability limited';
      return;
    }
    if (Notification.permission === 'denied') {
      status.textContent = 'Notifications are blocked in browser settings.';
      capability.textContent = 'Allow notifications for this site before enabling reminders.';
      capability.className = 'reminder-capability limited';
      return;
    }
    if (!enabled) status.textContent = 'Off. Enable it to receive a reminder when something is still pending.';
    else status.textContent = `Enabled for ${time}. Habit Companion checks once per minute while the app is open.`;

    const bg = await backgroundStatus();
    if (bg.supported && bg.registered) {
      capability.textContent = 'Background checks are registered. Their exact timing is still controlled by the browser.';
      capability.className = 'reminder-capability good';
    } else {
      capability.textContent = 'Closed-app reminders are not reliable in this browser. Keep Habit Companion open for exact-time checks.';
      capability.className = 'reminder-capability limited';
    }
  }

  async function buildUI() {
    const storageNote = document.querySelector('.storage-note');
    if (!storageNote || document.getElementById('reminderSettings')) return;
    injectStyles();
    const section = document.createElement('section');
    section.className = 'reminder-settings';
    section.id = 'reminderSettings';
    section.innerHTML = `<div class="reminder-heading"><div><strong>Daily reminder</strong><p>Only notify me when something is still pending.</p></div><label class="reminder-switch" aria-label="Daily reminder"><input id="reminderEnabled" type="checkbox"><span></span></label></div><div class="reminder-time-row"><label for="reminderTime">Reminder time</label><input class="reminder-time" id="reminderTime" type="time" value="${DEFAULT_TIME}"></div><p class="reminder-status" id="reminderStatus"></p><div class="reminder-capability" id="reminderCapability"></div><div class="reminder-actions"><button type="button" class="reminder-test" id="reminderTest">Check reminder now</button></div>`;
    storageNote.insertAdjacentElement('afterend', section);

    document.getElementById('reminderEnabled').addEventListener('change', async event => {
      const toggle = event.target;
      if (toggle.checked) {
        if (!('Notification' in window)) {
          toggle.checked = false;
          await setSetting('enabled', false);
          await refreshUI();
          return;
        }
        let permission = Notification.permission;
        if (permission === 'default') permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          toggle.checked = false;
          await setSetting('enabled', false);
          await refreshUI();
          return;
        }
        await setSetting('enabled', true);
        await registerPeriodicCheck(true);
        await scheduleForegroundReminder();
        await maybeNotify();
      } else {
        await setSetting('enabled', false);
        await registerPeriodicCheck(false);
        if (reminderTimer) clearTimeout(reminderTimer);
      }
      await refreshUI();
    });

    document.getElementById('reminderTime').addEventListener('change', async event => {
      await setSetting('time', event.target.value || DEFAULT_TIME);
      await setSetting('lastNotifiedDate', '');
      await scheduleForegroundReminder();
      await maybeNotify();
      await refreshUI();
    });

    document.getElementById('reminderTest').addEventListener('click', async () => {
      if (!('Notification' in window)) return;
      let permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        await refreshUI();
        return;
      }
      const count = await pendingCount();
      await showReminder(count, true);
      await refreshUI();
    });

    await refreshUI();
    await scheduleForegroundReminder();
    startForegroundPolling();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      maybeNotify().catch(() => {});
      scheduleForegroundReminder().catch(() => {});
    }
  });
  window.addEventListener('focus', () => maybeNotify().catch(() => {}));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
  else buildUI();
})();
