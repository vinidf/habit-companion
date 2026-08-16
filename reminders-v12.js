(() => {
  const DB = 'habit-companion-reminders';
  const STORE = 'settings';
  const DEFAULT_TIME = '21:00';
  const SYNC_TAG = 'habit-companion-reminder';
  let timer = null;
  let poller = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getSetting(key, fallback) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : fallback);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  }

  async function setSetting(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key, value });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function weekStart(date = new Date()) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    copy.setDate(copy.getDate() - copy.getDay());
    return copy;
  }

  function weekEnd(date = new Date()) {
    const end = weekStart(date);
    end.setDate(end.getDate() + 6);
    return end;
  }

  function minuteOfDay(time) {
    const [h, m] = String(time || DEFAULT_TIME).split(':').map(Number);
    return h * 60 + m;
  }

  async function habitData() {
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
        const habits = tx.objectStore('habits').getAll();
        const completions = tx.objectStore('completions').getAll();
        tx.oncomplete = () => { db.close(); resolve({ habits: habits.result || [], completions: completions.result || [] }); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function pendingCount() {
    const { habits, completions } = await habitData();
    const now = new Date();
    const today = dateKey(now);
    const start = dateKey(weekStart(now));
    const end = dateKey(weekEnd(now));
    const doneToday = new Set(completions.filter(item => item.date === today).map(item => item.habitId));
    const weekCounts = new Map();
    completions.forEach(item => {
      if (item.date >= start && item.date <= end) weekCounts.set(item.habitId, (weekCounts.get(item.habitId) || 0) + 1);
    });
    return habits.filter(habit => {
      if (doneToday.has(habit.id)) return false;
      if (habit.frequency === 'daily') return true;
      if (habit.frequency === 'scheduled') return Array.isArray(habit.days) && habit.days.includes(now.getDay());
      return (weekCounts.get(habit.id) || 0) < Math.max(1, Number(habit.idealPerWeek || 1));
    }).length;
  }

  async function show(count, test = false) {
    const registration = await navigator.serviceWorker.ready;
    const body = test
      ? count ? `${count} habit${count === 1 ? ' is' : 's are'} pending right now.` : 'Nothing is pending. Notifications can be displayed on this device.'
      : count === 1 ? '1 habit is still pending today.' : `${count} habits are still pending today.`;
    await registration.showNotification(test ? 'Habit Companion notification test' : 'A quick check before the day ends', {
      body,
      icon: './icon.svg',
      tag: test ? `habit-companion-test-${Date.now()}` : 'habit-companion-daily-reminder',
      data: { url: './' }
    });
  }

  async function maybeNotify() {
    if (!(await getSetting('enabled', false))) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const time = await getSetting('time', DEFAULT_TIME);
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() < minuteOfDay(time)) return;
    const today = dateKey(now);
    if ((await getSetting('lastNotifiedDate', '')) === today) return;
    const count = await pendingCount();
    if (!count) return;
    await show(count);
    await setSetting('lastNotifiedDate', today);
  }

  async function schedule() {
    if (timer) clearTimeout(timer);
    if (!(await getSetting('enabled', false))) return;
    const [h, m] = (await getSetting('time', DEFAULT_TIME)).split(':').map(Number);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    timer = setTimeout(async () => { await maybeNotify().catch(() => {}); schedule(); }, Math.max(1000, target - now));
  }

  async function periodicStatus(enable = null) {
    if (!('serviceWorker' in navigator)) return { supported: false, registered: false };
    const registration = await navigator.serviceWorker.ready;
    if (!('periodicSync' in registration)) return { supported: false, registered: false };
    try {
      if (enable === true) await registration.periodicSync.register(SYNC_TAG, { minInterval: 86400000 });
      if (enable === false) await registration.periodicSync.unregister(SYNC_TAG);
      const tags = await registration.periodicSync.getTags();
      return { supported: true, registered: tags.includes(SYNC_TAG) };
    } catch {
      return { supported: true, registered: false };
    }
  }

  function samsungInternet() {
    return /SamsungBrowser/i.test(navigator.userAgent);
  }

  function styles() {
    const style = document.createElement('style');
    style.textContent = `.reminder-settings{margin-top:18px;padding:16px;border:1px solid var(--line);border-radius:18px;background:#f8faff}.reminder-heading{display:flex;justify-content:space-between;gap:14px}.reminder-heading strong{font-size:14px}.reminder-heading p,.reminder-status,.reminder-note{color:var(--muted);font-size:11px;line-height:1.45}.reminder-switch{position:relative;width:48px;height:28px}.reminder-switch input{opacity:0}.reminder-switch span{position:absolute;inset:0;border-radius:99px;background:#dce3ee}.reminder-switch span:after{content:"";position:absolute;width:22px;height:22px;left:3px;top:3px;border-radius:50%;background:#fff;transition:.18s}.reminder-switch input:checked+span{background:var(--primary)}.reminder-switch input:checked+span:after{transform:translateX(20px)}.reminder-time-row{display:flex;justify-content:space-between;align-items:center;margin-top:14px}.reminder-time{border:1px solid var(--line);background:#fff;border-radius:12px;padding:9px}.reminder-note{margin-top:10px;padding:10px 12px;background:#fff;border:1px solid var(--line);border-radius:12px}.reminder-test{width:100%;margin-top:10px;border:0;border-radius:12px;background:#eef3fb;color:var(--primary-deep);padding:10px;font-weight:800}`;
    document.head.appendChild(style);
  }

  async function refresh() {
    const toggle = document.getElementById('reminderEnabled');
    const input = document.getElementById('reminderTime');
    const status = document.getElementById('reminderStatus');
    const note = document.getElementById('reminderNote');
    if (!toggle || !input || !status || !note) return;
    const enabled = await getSetting('enabled', false);
    const time = await getSetting('time', DEFAULT_TIME);
    toggle.checked = enabled;
    input.value = time;
    input.disabled = !enabled;
    if (!('Notification' in window)) {
      status.textContent = 'This browser does not expose the Notifications API.';
      note.textContent = 'Daily notifications cannot be enabled here.';
      return;
    }
    if (Notification.permission === 'denied') {
      status.textContent = 'Notifications are blocked for this site.';
      note.textContent = samsungInternet() ? 'Samsung Internet is blocking this site permission. Allow notifications for vinidf.github.io in Samsung Internet site permissions, then return here.' : 'Allow notifications for this site in your browser settings, then return here.';
      return;
    }
    status.textContent = enabled ? `Enabled for ${time}. Exact-time checks work while Habit Companion is open.` : 'Off.';
    const bg = await periodicStatus();
    note.textContent = bg.supported && bg.registered ? 'Background checks are registered, but their exact timing is controlled by the browser.' : 'Closed-app delivery is not guaranteed by this local reminder. Reliable closed-app delivery requires Web Push.';
  }

  async function build() {
    const anchor = document.querySelector('.storage-note');
    if (!anchor || document.getElementById('reminderSettings')) return;
    styles();
    const section = document.createElement('section');
    section.id = 'reminderSettings';
    section.className = 'reminder-settings';
    section.innerHTML = `<div class="reminder-heading"><div><strong>Daily reminder</strong><p>Notify only when something is still pending.</p></div><label class="reminder-switch"><input id="reminderEnabled" type="checkbox"><span></span></label></div><div class="reminder-time-row"><label for="reminderTime">Reminder time</label><input id="reminderTime" class="reminder-time" type="time" value="21:00"></div><p id="reminderStatus" class="reminder-status"></p><div id="reminderNote" class="reminder-note"></div><button id="reminderTest" type="button" class="reminder-test">Test notification now</button>`;
    anchor.insertAdjacentElement('afterend', section);

    document.getElementById('reminderEnabled').addEventListener('change', async event => {
      if (event.target.checked) {
        if (!('Notification' in window)) return refresh();
        let permission = Notification.permission;
        if (permission === 'default') permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          event.target.checked = false;
          await setSetting('enabled', false);
          return refresh();
        }
        await setSetting('enabled', true);
        await periodicStatus(true);
      } else {
        await setSetting('enabled', false);
        await periodicStatus(false);
      }
      await schedule();
      await refresh();
    });

    document.getElementById('reminderTime').addEventListener('change', async event => {
      await setSetting('time', event.target.value || DEFAULT_TIME);
      await setSetting('lastNotifiedDate', '');
      await schedule();
      await refresh();
    });

    document.getElementById('reminderTest').addEventListener('click', async () => {
      if (!('Notification' in window)) return;
      let permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission !== 'granted') return refresh();
      await show(await pendingCount(), true);
      await refresh();
    });

    await refresh();
    await schedule();
    if (poller) clearInterval(poller);
    poller = setInterval(() => { if (document.visibilityState === 'visible') maybeNotify().catch(() => {}); }, 60000);
  }

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') maybeNotify().catch(() => {}); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
