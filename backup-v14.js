(() => {
  const APP = 'habit-companion';
  const SCHEMA_VERSION = 2;
  const REMINDER_DB = 'habit-companion-reminders';
  const REMINDER_STORE = 'settings';

  function openReminderDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(REMINDER_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(REMINDER_STORE)) db.createObjectStore(REMINDER_STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readReminderSettings() {
    try {
      const db = await openReminderDB();
      if (!db.objectStoreNames.contains(REMINDER_STORE)) {
        db.close();
        return {};
      }
      const rows = await new Promise((resolve, reject) => {
        const tx = db.transaction(REMINDER_STORE, 'readonly');
        const request = tx.objectStore(REMINDER_STORE).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return Object.fromEntries(rows.map(row => [row.key, row.value]));
    } catch {
      return {};
    }
  }

  async function replaceReminderSettings(settings = {}) {
    const db = await openReminderDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(REMINDER_STORE, 'readwrite');
      const store = tx.objectStore(REMINDER_STORE);
      store.clear();
      for (const [key, value] of Object.entries(settings || {})) store.put({ key, value });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  function normalizeHabit(habit) {
    if (!habit || typeof habit !== 'object' || !habit.id || !habit.name) throw new Error('Invalid habit');
    const frequency = ['daily', 'scheduled', 'flexible'].includes(habit.frequency) ? habit.frequency : 'daily';
    const createdAt = habit.createdAt || habit.startedAt || new Date().toISOString();
    return {
      ...habit,
      id: String(habit.id),
      name: String(habit.name),
      emoji: habit.emoji || '✦',
      frequency,
      days: Array.isArray(habit.days) ? [...new Set(habit.days.map(Number).filter(day => day >= 0 && day <= 6))].sort((a, b) => a - b) : [],
      idealPerWeek: Math.max(1, Number(habit.idealPerWeek || (frequency === 'daily' ? 7 : 1))),
      minimumPerWeek: Math.max(0, Number(habit.minimumPerWeek || 0)),
      createdAt,
      startedAt: habit.startedAt || createdAt,
      updatedAt: habit.updatedAt || createdAt
    };
  }

  function normalizeCompletion(completion, validHabitIds) {
    if (!completion || typeof completion !== 'object' || !completion.id || !completion.habitId || !completion.date) throw new Error('Invalid completion');
    const habitId = String(completion.habitId);
    if (!validHabitIds.has(habitId)) throw new Error('Completion references missing habit');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(completion.date))) throw new Error('Invalid completion date');
    return {
      ...completion,
      id: String(completion.id),
      habitId,
      date: String(completion.date),
      createdAt: completion.createdAt || `${completion.date}T12:00:00`
    };
  }

  async function buildBackup() {
    const storedHabits = (await HabitDB.getAllHabits()).map(normalizeHabit);
    const validHabitIds = new Set(storedHabits.map(habit => habit.id));
    const storedCompletions = (await HabitDB.getAllCompletions()).map(item => normalizeCompletion(item, validHabitIds));
    const reminderSettings = await readReminderSettings();
    return {
      app: APP,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      weekStartsOn: 0,
      habits: storedHabits,
      completions: storedCompletions,
      settings: {
        reminders: {
          enabled: Boolean(reminderSettings.enabled),
          time: typeof reminderSettings.time === 'string' ? reminderSettings.time : '21:00',
          lastNotifiedDate: reminderSettings.lastNotifiedDate || '',
          lastCheckedAt: reminderSettings.lastCheckedAt || ''
        }
      },
      counts: {
        habits: storedHabits.length,
        completions: storedCompletions.length
      }
    };
  }

  function validateBackup(data) {
    if (!data || data.app !== APP) throw new Error('Wrong app');
    if (!Array.isArray(data.habits) || !Array.isArray(data.completions)) throw new Error('Missing data');
    const habits = data.habits.map(normalizeHabit);
    const ids = new Set(habits.map(habit => habit.id));
    if (ids.size !== habits.length) throw new Error('Duplicate habit IDs');
    const completions = data.completions.map(item => normalizeCompletion(item, ids));
    const completionIds = new Set(completions.map(item => item.id));
    if (completionIds.size !== completions.length) throw new Error('Duplicate completion IDs');
    const reminders = data.settings?.reminders || {};
    return {
      habits,
      completions,
      reminders: {
        enabled: Boolean(reminders.enabled),
        time: /^\d{2}:\d{2}$/.test(reminders.time || '') ? reminders.time : '21:00',
        lastNotifiedDate: reminders.lastNotifiedDate || '',
        lastCheckedAt: reminders.lastCheckedAt || ''
      }
    };
  }

  function timestampKey(includeTime = false) {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (!includeTime) return date;
    return `${date}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  }

  function downloadBackupData(backup, options = {}) {
    const automatic = Boolean(options.automatic);
    const payload = { ...backup, backupReason: automatic ? 'habit-completed' : 'manual' };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = automatic
      ? `habit-companion-auto-${timestampKey(true)}.json`
      : `habit-companion-backup-${timestampKey(false)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return payload;
  }

  async function downloadBackup(options = {}) {
    const backup = await buildBackup();
    return downloadBackupData(backup, options);
  }

  async function restoreBackup(file) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const data = validateBackup(parsed);
    if (!confirm(`Replace this device with this backup?\n\n${data.habits.length} habits\n${data.completions.length} completion records`)) return false;
    await HabitDB.replaceAll({ habits: data.habits, completions: data.completions });
    await replaceReminderSettings(data.reminders);
    return true;
  }

  function install() {
    const exportButton = document.getElementById('exportButton');
    const importButton = document.getElementById('importButton');
    const importInput = document.getElementById('importInput');
    if (!exportButton || !importButton || !importInput) return;

    const newExport = exportButton.cloneNode(true);
    exportButton.replaceWith(newExport);
    newExport.addEventListener('click', () => downloadBackup().catch(() => alert('Could not create the backup.')));

    const newInput = importInput.cloneNode(true);
    importInput.replaceWith(newInput);

    const newImport = importButton.cloneNode(true);
    importButton.replaceWith(newImport);
    newImport.addEventListener('click', () => newInput.click());

    newInput.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const restored = await restoreBackup(file);
        if (restored) location.reload();
      } catch {
        alert('That file is not a valid Habit Companion backup or is missing required data.');
      } finally {
        event.target.value = '';
      }
    });
  }

  window.HabitBackup = { buildBackup, downloadBackup, downloadBackupData, restoreBackup, validateBackup };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
