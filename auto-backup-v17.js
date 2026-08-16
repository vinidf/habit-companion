(() => {
  if (!window.HabitDB) return;

  const BACKUP_DB = 'habit-companion-auto-backups';
  const BACKUP_STORE = 'snapshots';
  let pendingCompletion = false;
  let preparedName = '';
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

  function timestampKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  }

  async function saveSnapshot(backup) {
    const db = await openBackupDB();
    const payload = { ...backup, backupReason: 'habit-completed', automatic: true };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(BACKUP_STORE, 'readwrite');
      tx.objectStore(BACKUP_STORE).put({ key: 'latest', savedAt: new Date().toISOString(), backup: payload });
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
      button.textContent = 'Continue & download backup';
      button.removeAttribute('aria-busy');
      return;
    }
    button.disabled = false;
    button.textContent = 'Continue';
    button.removeAttribute('aria-busy');
  }

  async function waitForBackupApi() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (window.HabitBackup?.buildBackup) return true;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return false;
  }

  async function prepareBackup() {
    setButtonState('preparing');
    preparedName = '';
    const ready = await waitForBackupApi();
    if (!ready) throw new Error('Backup API unavailable');
    const backup = await HabitBackup.buildBackup();
    await saveSnapshot(backup);
    preparedName = `habit-companion-auto-${timestampKey()}.json`;
    setButtonState('ready');
  }

  function triggerDownload() {
    if (!pendingCompletion || !preparedName) return false;
    const link = document.createElement('a');
    link.href = `./__habit_backup__/${encodeURIComponent(preparedName)}`;
    link.download = preparedName;
    link.target = '_self';
    document.body.appendChild(link);
    link.click();
    link.remove();
    pendingCompletion = false;
    preparedName = '';
    preparing = null;
    setButtonState('idle');
    return true;
  }

  const originalPutCompletion = HabitDB.putCompletion.bind(HabitDB);
  HabitDB.putCompletion = async completion => {
    const result = await originalPutCompletion(completion);
    pendingCompletion = true;
    preparing = prepareBackup().catch(() => {
      preparedName = '';
      setButtonState('idle');
    });
    return result;
  };

  function install() {
    const dialog = document.getElementById('celebrationDialog');
    const continueButton = document.getElementById('celebrationClose');
    if (!dialog || !continueButton) return;

    continueButton.addEventListener('click', event => {
      if (!pendingCompletion) return;
      if (!preparedName) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      triggerDownload();
    }, true);

    dialog.addEventListener('click', event => {
      if (event.target !== dialog || !pendingCompletion) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (preparedName) {
        triggerDownload();
        dialog.close();
      }
    }, true);

    dialog.addEventListener('cancel', event => {
      if (!pendingCompletion) return;
      event.preventDefault();
      if (preparedName) {
        triggerDownload();
        dialog.close();
      }
    });

    window.HabitAutoBackup = {
      downloadLatest() {
        const name = `habit-companion-auto-latest-${timestampKey()}.json`;
        const link = document.createElement('a');
        link.href = `./__habit_backup__/${encodeURIComponent(name)}`;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
