(() => {
  if (!window.HabitDB) return;

  const BACKUP_DB = 'habit-companion-auto-backups';
  const BACKUP_STORE = 'snapshots';
  let pendingCompletion = false;
  let preparedBackup = null;
  let preparing = null;

  function openBackupDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(BACKUP_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(BACKUP_STORE)) db.createObjectStore(BACKUP_STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveLocalSnapshot(backup) {
    const db = await openBackupDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(BACKUP_STORE, 'readwrite');
      tx.objectStore(BACKUP_STORE).put({
        key: 'latest',
        savedAt: new Date().toISOString(),
        backup: { ...backup, backupReason: 'habit-completed', automatic: true }
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  function setButtonState(state) {
    const button = document.getElementById('celebrationClose');
    if (!button) return;
    if (state === 'preparing') {
      button.disabled = true;
      button.textContent = 'Preparing backup…';
      button.setAttribute('aria-busy', 'true');
      return;
    }
    if (state === 'ready') {
      button.disabled = false;
      button.textContent = 'Continue & save backup';
      button.removeAttribute('aria-busy');
      return;
    }
    button.disabled = false;
    button.textContent = 'Continue';
    button.removeAttribute('aria-busy');
  }

  async function waitForBackupApi() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (window.HabitBackup?.buildBackup && window.HabitBackup?.downloadBackupData) return true;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return false;
  }

  async function prepareBackup() {
    setButtonState('preparing');
    preparedBackup = null;
    const ready = await waitForBackupApi();
    if (!ready) throw new Error('Backup API unavailable');
    const backup = await HabitBackup.buildBackup();
    preparedBackup = backup;
    await saveLocalSnapshot(backup);
    setButtonState('ready');
  }

  function reset() {
    pendingCompletion = false;
    preparedBackup = null;
    preparing = null;
    setButtonState('idle');
  }

  function downloadNow() {
    if (!pendingCompletion || !preparedBackup || !window.HabitBackup?.downloadBackupData) return false;
    HabitBackup.downloadBackupData(preparedBackup, { automatic: true });
    reset();
    return true;
  }

  const originalPutCompletion = HabitDB.putCompletion.bind(HabitDB);
  HabitDB.putCompletion = async completion => {
    const result = await originalPutCompletion(completion);
    pendingCompletion = true;
    preparing = prepareBackup().catch(() => {
      preparedBackup = null;
      setButtonState('ready');
    });
    return result;
  };

  function install() {
    const dialog = document.getElementById('celebrationDialog');
    const continueButton = document.getElementById('celebrationClose');
    if (!dialog || !continueButton) return;

    continueButton.addEventListener('click', event => {
      if (!pendingCompletion) return;
      if (!preparedBackup) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      downloadNow();
    }, true);

    dialog.addEventListener('click', event => {
      if (event.target !== dialog || !pendingCompletion) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (preparedBackup) {
        downloadNow();
        dialog.close();
      }
    }, true);

    dialog.addEventListener('cancel', event => {
      if (!pendingCompletion) return;
      event.preventDefault();
      if (preparedBackup) {
        downloadNow();
        dialog.close();
      }
    });

    dialog.addEventListener('close', () => {
      if (!pendingCompletion) setButtonState('idle');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
