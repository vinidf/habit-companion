(() => {
  if (!window.HabitDB) return;

  let preparedUrl = '';
  let preparedName = '';
  let preparing = null;
  let pendingCompletion = false;

  function timestampKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  }

  function clearPrepared() {
    if (preparedUrl) URL.revokeObjectURL(preparedUrl);
    preparedUrl = '';
    preparedName = '';
  }

  async function prepareBackup() {
    if (!window.HabitBackup) return;
    clearPrepared();
    const backup = await HabitBackup.buildBackup();
    backup.backupReason = 'habit-completed';
    backup.automatic = true;
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    preparedUrl = URL.createObjectURL(blob);
    preparedName = `habit-companion-auto-${timestampKey()}.json`;
  }

  function downloadPrepared() {
    if (!pendingCompletion || !preparedUrl) return false;
    const link = document.createElement('a');
    link.href = preparedUrl;
    link.download = preparedName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    const oldUrl = preparedUrl;
    preparedUrl = '';
    preparedName = '';
    pendingCompletion = false;
    setTimeout(() => URL.revokeObjectURL(oldUrl), 1000);
    return true;
  }

  async function ensurePrepared() {
    if (preparedUrl) return true;
    if (preparing) {
      try { await preparing; } catch {}
      return Boolean(preparedUrl);
    }
    return false;
  }

  const originalPutCompletion = HabitDB.putCompletion.bind(HabitDB);
  HabitDB.putCompletion = async completion => {
    const result = await originalPutCompletion(completion);
    pendingCompletion = true;
    preparing = prepareBackup().catch(() => {
      clearPrepared();
    }).finally(() => {
      preparing = null;
    });
    return result;
  };

  function install() {
    const dialog = document.getElementById('celebrationDialog');
    const continueButton = document.getElementById('celebrationClose');
    if (!dialog || !continueButton) return;

    continueButton.addEventListener('click', event => {
      if (!pendingCompletion) return;
      if (preparedUrl) {
        downloadPrepared();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      ensurePrepared().then(ready => {
        dialog.close();
        if (ready) downloadPrepared();
      });
    }, true);

    dialog.addEventListener('click', event => {
      if (event.target !== dialog || !pendingCompletion) return;
      if (preparedUrl) downloadPrepared();
    }, true);

    dialog.addEventListener('cancel', event => {
      if (!pendingCompletion) return;
      if (preparedUrl) downloadPrepared();
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
