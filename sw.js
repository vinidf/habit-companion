const CACHE = 'habit-companion-v11';
const ASSETS = ['./', './index.html', './styles.css?v=11', './icon-picker.css?v=11', './db.js?v=11', './app.js?v=11', './icons-ui.js?v=11', './reminders.js?v=11', './manifest.webmanifest', './icon.svg'];
const REMINDER_DB = 'habit-companion-reminders';
const REMINDER_STORE = 'settings';
const SYNC_TAG = 'habit-companion-reminder';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});

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

function openDB(name, version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getReminderSetting(key, fallback) {
  try {
    const db = await openDB(REMINDER_DB, 1);
    return await new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(REMINDER_STORE)) {
        db.close();
        resolve(fallback);
        return;
      }
      const tx = db.transaction(REMINDER_STORE, 'readonly');
      const req = tx.objectStore(REMINDER_STORE).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return fallback;
  }
}

async function setReminderSetting(key, value) {
  const db = await openDB(REMINDER_DB, 1);
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(REMINDER_STORE)) {
      db.close();
      resolve();
      return;
    }
    const tx = db.transaction(REMINDER_STORE, 'readwrite');
    tx.objectStore(REMINDER_STORE).put({ key, value });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function getHabitData() {
  const db = await openDB('habit-companion', 1);
  return new Promise((resolve, reject) => {
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
    return (weekCounts.get(habit.id) || 0) < Math.max(1, Number(habit.idealPerWeek || 1));
  }).length;
}

async function maybeShowBackgroundReminder() {
  if (!(await getReminderSetting('enabled', false))) return;
  const time = await getReminderSetting('time', '21:00');
  const [hours, minutes] = time.split(':').map(Number);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  if (currentMinutes < hours * 60 + minutes) return;
  const today = localDateKey(now);
  if ((await getReminderSetting('lastNotifiedDate', '')) === today) return;
  const count = await pendingCount();
  if (count <= 0) return;
  await self.registration.showNotification('A quick check before the day ends', {
    body: count === 1 ? '1 habit is still pending today.' : `${count} habits are still pending today.`,
    icon: './icon.svg',
    tag: 'habit-companion-daily-reminder',
    data: { url: './' }
  });
  await setReminderSetting('lastNotifiedDate', today);
}

self.addEventListener('periodicsync', event => {
  if (event.tag === SYNC_TAG) event.waitUntil(maybeShowBackgroundReminder());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if ('focus' in client) {
        await client.focus();
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow('./');
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        throw new Error('Offline resource unavailable');
      })
  );
});
