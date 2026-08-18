(() => {
  const YEAR_MS = 86400000;
  let observer = null;
  let rendering = false;

  function key(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function startDate(habit) {
    const value = habit.startedAt || habit.createdAt;
    if (!value) return new Date();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  }

  function yearWindow(habit) {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1, 12);
    const yearEnd = new Date(now.getFullYear(), 11, 31, 12);
    const start = startDate(habit);
    return { start: start > yearStart ? start : yearStart, end: yearEnd };
  }

  function daysInclusive(start, end) {
    return Math.max(0, Math.floor((end - start) / YEAR_MS) + 1);
  }

  function annualTarget(habit) {
    const { start, end } = yearWindow(habit);
    if (start > end) return 0;
    if (habit.frequency === 'daily') return daysInclusive(start, end);
    if (habit.frequency === 'scheduled') {
      const days = new Set(Array.isArray(habit.days) ? habit.days : []);
      let total = 0;
      for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        if (days.has(cursor.getDay())) total += 1;
      }
      return total;
    }
    return Math.max(1, Math.ceil(daysInclusive(start, end) / 7 * Math.max(1, Number(habit.idealPerWeek || 1))));
  }

  function stageFor(ratio, done) {
    if (!done) return 0;
    if (ratio < .02) return 1;
    if (ratio < .05) return 2;
    if (ratio < .10) return 3;
    if (ratio < .18) return 4;
    if (ratio < .30) return 5;
    if (ratio < .45) return 6;
    if (ratio < .60) return 7;
    if (ratio < .75) return 8;
    if (ratio < .90) return 9;
    return 10;
  }

  function tree(stage) {
    if (!stage) return '<div class="garden-seed"><span></span></div>';
    if (stage === 1) return '<div class="garden-sprout"><i></i><b></b><em></em></div>';
    const leaves = Math.min(12, stage + 2);
    return `<div class="garden-tree stage-${stage}"><div class="tree-canopy">${Array.from({ length: leaves }, (_, i) => `<span class="leaf leaf-${i + 1}"></span>`).join('')}</div><div class="tree-trunk"></div>${stage >= 8 ? '<span class="tree-spark spark-a">✦</span><span class="tree-spark spark-b">✦</span>' : ''}</div>`;
  }

  function escape(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  async function loadData() {
    if (!window.HabitDB) return null;
    return { habits: await HabitDB.getAllHabits(), completions: await HabitDB.getAllCompletions() };
  }

  async function refresh() {
    if (rendering) return;
    const section = document.querySelector('#momentumSection');
    const list = document.querySelector('#momentumList');
    if (!section || !list) return;
    try {
      const data = await loadData();
      if (!data) return;
      rendering = true;
      if (observer) observer.disconnect();
      section.hidden = !data.habits.length;
      list.innerHTML = '';
      const endKey = key(new Date(new Date().getFullYear(), 11, 31, 12));
      data.habits.forEach(habit => {
        const { start } = yearWindow(habit);
        const startKey = key(start);
        const done = data.completions.filter(item => item.habitId === habit.id && item.date >= startKey && item.date <= endKey).length;
        const target = annualTarget(habit);
        const ratio = target ? Math.min(1, done / target) : 0;
        const stage = stageFor(ratio, done);
        const percent = Math.round(ratio * 100);
        const card = document.createElement('div');
        card.className = 'momentum-card garden-card';
        card.innerHTML = `<div class="garden-visual"><div class="garden-sky">${tree(stage)}<div class="garden-ground"></div></div></div><div class="garden-copy"><div class="momentum-name"><span>${escape(habit.emoji || '✦')}</span><span>${escape(habit.name)}</span></div><div class="garden-stats"><strong>${done}</strong> of ${target} yearly repetitions</div><div class="garden-progress"><span style="width:${percent}%"></span></div><div class="garden-footer"><span>${percent}% of this year's ideal</span><span>${habit.frequency === 'daily' ? 'Daily' : 'Weekly'} momentum</span></div></div>`;
        list.appendChild(card);
      });
    } catch {} finally {
      rendering = false;
      if (observer) observer.observe(list, { childList: true, subtree: true });
    }
  }

  function start() {
    const list = document.querySelector('#momentumList');
    if (!list) return;
    observer = new MutationObserver(() => refresh());
    observer.observe(list, { childList: true, subtree: true });
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
