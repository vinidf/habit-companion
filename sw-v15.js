const CACHE = 'habit-companion-v15';
const ASSETS = ['./', './index.html', './styles.css?v=15', './icon-picker.css?v=15', './db.js?v=15', './data-integrity-v14.js?v=15', './app.js?v=15', './week-sunday.js?v=15', './momentum-period.js?v=15', './icons-ui.js?v=15', './reminders-v12.js?v=15', './backup-v14.js?v=15', './auto-backup-v15.js?v=15', './manifest.webmanifest', './icon.svg'];
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

function openDB(name, version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getSetting(key, fallback) {
  try {
    const db = await openDB(REMINDER_DB, 1);
    if (!db.objectStoreNames.contains(REMINDER_STORE)) { db.close(); return fallback; }
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(REMINDER_STORE, 'readonly');
      const request = tx.objectStore(REMINDER_STORE).get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : fallback);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return fallback;
  }
}

async function setSetting(key, value) {
  try {
    const db = await openDB(REMINDER_DB, 1);
    if (!db.objectStoreNames.contains(REMINDER_STORE)) { db.close(); return; }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(REMINDER_STORE, 'readwrite');
      tx.objectStore(REMINDER_STORE).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {}
}

async function pendingCount() {
  const db = await openDB('habit-companion', 1);
  if (!db.objectStoreNames.contains('habits') || !db.objectStoreNames.contains('completions')) { db.close(); return 0; }
  const data = await new Promise((resolve, reject) => {
    const tx = db.transaction(['habits', 'completions'], 'readonly');
    const habits = tx.objectStore('habits').getAll();
    const completions = tx.objectStore('completions').getAll();
    tx.oncomplete = () => resolve({ habits: habits.result || [], completions: completions.result || [] });
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  const now = new Date();
  const today = dateKey(now);
  const start = dateKey(weekStart(now));
  const end = dateKey(weekEnd(now));
  const doneToday = new Set(data.completions.filter(item => item.date === today).map(item => item.habitId));
  const weekCounts = new Map();
  data.completions.forEach(item => {
    if (item.date >= start && item.date <= end) weekCounts.set(item.habitId, (weekCounts.get(item.habitId) || 0) + 1);
  });
  return data.habits.filter(habit => {
    if (doneToday.has(habit.id)) return false;
    if (habit.frequency === 'daily') return true;
    if (habit.frequency === 'scheduled') return Array.isArray(habit.days) && habit.days.includes(now.getDay());
    return (weekCounts.get(habit.id) || 0) < Math.max(1, Number(habit.idealPerWeek || 1));
  }).length;
}

async function backgroundReminder() {
  if (!(await getSetting('enabled', false))) return;
  const time = await getSetting('time', '21:00');
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  const today = dateKey(now);
  if ((await getSetting('lastNotifiedDate', '')) === today) return;
  const count = await pendingCount();
  if (!count) return;
  await self.registration.showNotification('A quick check before the day ends', {
    body: count === 1 ? '1 habit is still pending today.' : `${count} habits are still pending today.`,
    icon: './icon.svg',
    tag: 'habit-companion-daily-reminder',
    data: { url: './' }
  });
  await setSetting('lastNotifiedDate', today);
}

self.addEventListener('periodicsync', event => {
  if (event.tag === SYNC_TAG) event.waitUntil(backgroundReminder());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if ('focus' in client) { await client.focus(); return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow('./');
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      throw new Error('Offline resource unavailable');
    })
  );
});
