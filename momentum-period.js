(() => {
  function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function localDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function earliestCompletionDate(habit) {
    if (typeof habitCompletions !== 'function') return null;
    const first = habitCompletions(habit.id).map(item => item.date).sort()[0];
    return first ? new Date(`${first}T12:00:00`) : null;
  }

  function effectiveStart(habit) {
    return validDate(habit.startedAt) || validDate(habit.createdAt) || earliestCompletionDate(habit) || new Date();
  }

  function startInCurrentYear(habit) {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1, 12);
    const yearEnd = new Date(now.getFullYear(), 11, 31, 12);
    const inserted = effectiveStart(habit);
    const normalized = new Date(inserted.getFullYear(), inserted.getMonth(), inserted.getDate(), 12);
    const start = normalized > yearStart ? normalized : yearStart;
    return { start, yearEnd };
  }

  function daysInclusive(start, end) {
    return Math.max(0, Math.floor((end - start) / 86400000) + 1);
  }

  window.annualTarget = function(habit) {
    const { start, yearEnd } = startInCurrentYear(habit);
    if (start > yearEnd) return 0;
    if (habit.frequency === 'daily') return daysInclusive(start, yearEnd);
    if (habit.frequency === 'scheduled') {
      const scheduledDays = new Set(Array.isArray(habit.days) ? habit.days : []);
      let target = 0;
      for (let cursor = new Date(start); cursor <= yearEnd; cursor.setDate(cursor.getDate() + 1)) {
        if (scheduledDays.has(cursor.getDay())) target += 1;
      }
      return target;
    }
    const ideal = Math.max(1, Number(habit.idealPerWeek || 1));
    return Math.max(1, Math.ceil((daysInclusive(start, yearEnd) / 7) * ideal));
  };

  window.completionsThisYear = function(habit) {
    const { start, yearEnd } = startInCurrentYear(habit);
    const startKey = localDateKey(start);
    const endKey = localDateKey(yearEnd);
    if (typeof habitCompletions !== 'function') return 0;
    return habitCompletions(habit.id).filter(item => item.date >= startKey && item.date <= endKey).length;
  };

  window.yearlyGardenInfo = function(habit) {
    const done = window.completionsThisYear(habit);
    const target = window.annualTarget(habit);
    const ratio = target > 0 ? Math.min(1, done / target) : 0;
    let stage = 0;
    if (done > 0) stage = 1;
    if (ratio >= .04) stage = 2;
    if (ratio >= .12) stage = 3;
    if (ratio >= .28) stage = 4;
    if (ratio >= .5) stage = 5;
    if (ratio >= .75) stage = 6;
    return { done, target, ratio, stage };
  };

  async function migrateStartDates() {
    if (typeof HabitDB === 'undefined') return;
    const storedHabits = await HabitDB.getAllHabits();
    const storedCompletions = await HabitDB.getAllCompletions();
    let changed = false;
    for (const habit of storedHabits) {
      if (habit.startedAt) continue;
      const earliest = storedCompletions
        .filter(item => item.habitId === habit.id)
        .map(item => item.date)
        .sort()[0];
      habit.startedAt = habit.createdAt || (earliest ? `${earliest}T12:00:00` : new Date().toISOString());
      await HabitDB.putHabit(habit);
      changed = true;
    }
    if (changed && typeof render === 'function') render();
  }

  setTimeout(() => migrateStartDates().catch(() => {}), 150);
})();
