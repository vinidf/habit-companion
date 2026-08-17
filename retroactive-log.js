(() => {
  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function habitStartedOn(habit, dateKey) {
    const start = habit.startedAt || habit.createdAt;
    if (!start) return true;
    return dateKey >= localDateKey(new Date(start));
  }

  function dueOn(habit, dateKey) {
    const date = parseDateKey(dateKey);
    if (habit.frequency === 'daily') return true;
    if (habit.frequency === 'scheduled') return Array.isArray(habit.days) && habit.days.includes(date.getDay());
    return true;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>\'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `.retro-log-card{margin-top:18px;padding:16px;border:1px solid var(--line);border-radius:18px;background:#f8faff}.retro-log-card h3{margin:0;font-size:15px}.retro-log-card p{margin:5px 0 13px;color:var(--muted);font-size:12px;line-height:1.45}.retro-log-actions{display:flex;gap:8px}.retro-log-actions button{flex:1}.retro-log-dialog{width:min(92vw,480px);max-height:86vh;border:0;border-radius:24px;padding:0;background:transparent}.retro-log-dialog::backdrop{background:rgba(20,35,60,.38)}.retro-log-inner{background:white;padding:22px}.retro-log-list{display:grid;gap:8px;margin:15px 0;max-height:330px;overflow:auto}.retro-log-habit{display:flex;align-items:center;gap:10px;padding:11px;border:1px solid var(--line);border-radius:14px;cursor:pointer}.retro-log-habit input{width:18px;height:18px}.retro-log-habit small{display:block;color:var(--muted);margin-top:2px}.retro-log-date{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:12px;padding:11px;background:white;color:var(--ink)}.retro-log-note{font-size:11px;color:var(--muted);margin-top:10px;line-height:1.4}`;
    document.head.appendChild(style);
  }

  function createUI() {
    const anchor = document.querySelector('.data-actions');
    if (!anchor || document.getElementById('retroLogCard')) return;
    addStyles();

    const card = document.createElement('div');
    card.className = 'retro-log-card';
    card.id = 'retroLogCard';
    card.innerHTML = `<h3>Forgot to log a habit?</h3><p>Add a completion for a previous day. It will count toward the correct week and yearly momentum.</p><div class="retro-log-actions"><button class="secondary" id="retroLogOpen">Log a past day</button></div>`;
    anchor.insertAdjacentElement('afterend', card);

    const dialog = document.createElement('dialog');
    dialog.className = 'retro-log-dialog';
    dialog.id = 'retroLogDialog';
    dialog.innerHTML = `<form method="dialog" class="retro-log-inner" id="retroLogForm"><div class="sheet-header"><div><div class="eyebrow">Retroactive log</div><h2>When did you do it?</h2></div><button type="button" class="icon-button" id="retroLogClose" aria-label="Close">×</button></div><label class="field-label" for="retroLogDate">Date</label><input class="retro-log-date" id="retroLogDate" type="date"><div class="retro-log-list" id="retroLogList"></div><p class="retro-log-note">Only habits that already existed on that date can be logged. Scheduled habits show whether that weekday was selected.</p><div class="sheet-actions"><button type="submit" class="primary" id="retroLogSave">Save past completion</button></div></form>`;
    document.body.appendChild(dialog);

    const dateInput = dialog.querySelector('#retroLogDate');
    dateInput.max = localDateKey();
    dateInput.value = localDateKey(new Date(Date.now() - 86400000));

    function renderList() {
      const dateKey = dateInput.value;
      const list = dialog.querySelector('#retroLogList');
      list.innerHTML = '';
      habits.forEach(habit => {
        const already = completions.some(item => item.habitId === habit.id && item.date === dateKey);
        const available = habitStartedOn(habit, dateKey);
        const due = dueOn(habit, dateKey);
        const label = document.createElement('label');
        label.className = 'retro-log-habit';
        label.innerHTML = `<input type="checkbox" data-retro-habit="${escapeHtml(habit.id)}" ${already ? 'checked disabled' : ''} ${!available ? 'disabled' : ''}><span>${escapeHtml(habit.emoji || '✦')}</span><span><strong>${escapeHtml(habit.name)}</strong><small>${already ? 'Already logged' : !available ? 'Habit had not been created yet' : due ? 'Scheduled for this day' : 'Not scheduled for this day'}</small></span>`;
        list.appendChild(label);
      });
      if (!habits.length) list.innerHTML = '<p>No habits yet.</p>';
    }

    function openRetroLog() {
      dateInput.max = localDateKey();
      if (!dateInput.value || dateInput.value >= localDateKey()) dateInput.value = localDateKey(new Date(Date.now() - 86400000));
      renderList();
      dialog.showModal();
    }

    dateInput.addEventListener('change', renderList);
    document.getElementById('retroLogOpen').addEventListener('click', openRetroLog);
    document.getElementById('retroLogClose').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.querySelector('#retroLogForm').addEventListener('submit', async event => {
      event.preventDefault();
      const dateKey = dateInput.value;
      const selected = [...dialog.querySelectorAll('[data-retro-habit]:checked:not(:disabled)')].map(input => input.dataset.retroHabit);
      if (!dateKey || dateKey > localDateKey() || !selected.length) return;
      let added = 0;
      for (const habitId of selected) {
        const habit = habits.find(item => item.id === habitId);
        if (!habit || !habitStartedOn(habit, dateKey) || completions.some(item => item.habitId === habitId && item.date === dateKey)) continue;
        const completion = { id: `${habitId}:${dateKey}`, habitId, date: dateKey, createdAt: new Date().toISOString(), retroactive: true };
        await HabitDB.putCompletion(completion);
        completions.push(completion);
        added += 1;
      }
      dialog.close();
      render();
      if (added && window.HabitBackup?.downloadBackup) window.HabitBackup.downloadBackup({ automatic: true, reason: 'retroactive-log' }).catch(() => {});
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createUI);
  else createUI();
})();
