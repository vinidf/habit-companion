const MILESTONES = [1, 3, 7, 14, 30, 45, 60, 90, 120, 180, 270, 360, 500, 730, 1000];
const HABIT_ICONS = ['✦','🎹','🎵','🏋️','🏃','🚶','🏊','🚲','📚','🧠','🗣️','🌏','💧','🥗','🦷','😴','🧘','🧹','🐕','💊','☀️','✍️','💻','🎨'];
const COMPLETION_MESSAGES = [
  ['Nice work.', 'You showed up. That is the part habits are built from.'],
  ['Done for today.', 'One repetition is small. Repetitions together are not.'],
  ['That counts.', 'You reinforced the pattern instead of waiting for perfect conditions.'],
  ['Another layer.', 'A habit becomes familiar one ordinary repetition at a time.'],
  ['Good return.', 'The skill is not being perfect. It is coming back.']
];
const TREATS = [
  ['☕', 'Make a drink you enjoy.'],
  ['🎵', 'Play one favorite song with no multitasking.'],
  ['🌤️', 'Take five quiet minutes outside or by a window.'],
  ['🛋️', 'Take ten guilt-free minutes to do nothing useful.'],
  ['🍫', 'Have a small treat you already enjoy.'],
  ['📖', 'Read something purely for fun for ten minutes.'],
  ['🚿', 'Take a comfortable shower and reset.'],
  ['🐾', 'Spend a few unrushed minutes with a pet.']
];

let habits = [];
let completions = [];
let activeFrequency = 'daily';
let selectedDays = new Set();
let editingHabitId = null;
let selectedIcon = '✦';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

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

function startOfWeek(date = new Date()) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function endOfWeek(date = new Date()) {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function daysBetween(a, b) {
  const ms = parseDateKey(b) - parseDateKey(a);
  return Math.round(ms / 86400000);
}

function habitCompletions(habitId) {
  return completions.filter(item => item.habitId === habitId);
}

function completionsInRange(habitId, start, end) {
  const startKey = localDateKey(start);
  const endKey = localDateKey(end);
  return habitCompletions(habitId).filter(item => item.date >= startKey && item.date <= endKey);
}

function completionForDate(habitId, dateKey) {
  return completions.find(item => item.habitId === habitId && item.date === dateKey);
}

function weekGoal(habit) {
  if (habit.frequency === 'scheduled') return habit.days.length;
  return Number(habit.idealPerWeek || 1);
}

function weeklyCount(habit, date = new Date()) {
  return completionsInRange(habit.id, startOfWeek(date), endOfWeek(date)).length;
}

function isDueToday(habit) {
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'scheduled') return habit.days.includes(new Date().getDay());
  return weeklyCount(habit) < weekGoal(habit);
}

function isCompletedToday(habit) {
  return Boolean(completionForDate(habit.id, localDateKey()));
}

function weekStatus(habit, date) {
  const count = weeklyCount(habit, date);
  const ideal = weekGoal(habit);
  const minimum = Number(habit.minimumPerWeek || 0);
  if (count >= ideal) return 'ideal';
  if (minimum > 0 && count >= minimum) return 'minimum';
  return 'missed';
}

function completedWeekKeys(habit, includeMinimum = false) {
  const all = habitCompletions(habit.id).map(item => parseDateKey(item.date));
  if (!all.length) return [];
  const first = startOfWeek(new Date(Math.min(...all.map(date => date.getTime()))));
  const current = startOfWeek(new Date());
  const keys = [];
  for (let cursor = new Date(first); cursor <= current; cursor = addDays(cursor, 7)) {
    const status = weekStatus(habit, cursor);
    if (status === 'ideal' || (includeMinimum && status === 'minimum')) keys.push(localDateKey(cursor));
  }
  return keys;
}

function dailyStreak(habit) {
  const keys = new Set(habitCompletions(habit.id).map(item => item.date));
  if (!keys.size) return { current: 0, best: 0, total: 0 };
  const sorted = [...keys].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    if (daysBetween(sorted[i - 1], sorted[i]) === 1) {
      run += 1;
      best = Math.max(best, run);
    } else if (sorted[i - 1] !== sorted[i]) {
      run = 1;
    }
  }
  const today = localDateKey();
  const yesterday = localDateKey(addDays(new Date(), -1));
  let anchor = keys.has(today) ? today : keys.has(yesterday) ? yesterday : null;
  let current = 0;
  while (anchor && keys.has(anchor)) {
    current += 1;
    anchor = localDateKey(addDays(parseDateKey(anchor), -1));
  }
  return { current, best, total: keys.size };
}

function weeklyStreak(habit) {
  const successful = new Set(completedWeekKeys(habit));
  const allCompleted = [...successful].sort();
  if (!allCompleted.length) return { current: 0, best: 0, total: 0 };
  let best = 1;
  let run = 1;
  for (let i = 1; i < allCompleted.length; i += 1) {
    if (daysBetween(allCompleted[i - 1], allCompleted[i]) === 7) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  const thisWeek = localDateKey(startOfWeek());
  const lastWeek = localDateKey(addDays(startOfWeek(), -7));
  let anchor = successful.has(thisWeek) ? thisWeek : successful.has(lastWeek) ? lastWeek : null;
  let current = 0;
  while (anchor && successful.has(anchor)) {
    current += 1;
    anchor = localDateKey(addDays(parseDateKey(anchor), -7));
  }
  return { current, best, total: allCompleted.length };
}

function streakFor(habit) {
  return habit.frequency === 'daily' ? dailyStreak(habit) : weeklyStreak(habit);
}

function milestoneInfo(habit) {
  const value = streakFor(habit).current;
  const next = MILESTONES.find(item => item > value) || null;
  const previous = [...MILESTONES].reverse().find(item => item <= value) || 0;
  return { value, next, previous };
}

function greetingForHour() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatToday() {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
}

function frequencyCopy(habit) {
  if (habit.frequency === 'daily') return 'Every day';
  if (habit.frequency === 'scheduled') {
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return habit.days.map(day => labels[day]).join(' · ');
  }
  return `${habit.idealPerWeek}× this week · flexible days`;
}

function renderWeekDots(habit) {
  if (habit.frequency === 'daily') return '';
  const ideal = weekGoal(habit);
  const count = weeklyCount(habit);
  const minimum = Number(habit.minimumPerWeek || 0);
  let dots = '';
  for (let i = 0; i < ideal; i += 1) {
    const classes = ['week-dot'];
    if (i < count) classes.push('filled');
    if (minimum > 0 && i < Math.min(count, minimum) && count < ideal) classes.push('minimum');
    dots += `<span class="${classes.join(' ')}"></span>`;
  }
  const status = count >= ideal ? '<span class="status-pill good">Weekly goal met</span>' : minimum > 0 && count >= minimum ? '<span class="status-pill partial">Minimum met</span>' : `<span>${count}/${ideal} this week</span>`;
  return `<div class="week-progress">${dots}</div><div class="week-caption">${status}<span>${ideal - Math.min(count, ideal)} to ideal</span></div>`;
}

function render() {
  $('#greeting').textContent = greetingForHour();
  $('#todayLabel').textContent = formatToday();

  const list = $('#habitList');
  list.innerHTML = '';
  $('#emptyState').hidden = habits.length !== 0;
  $('#floatingAddButton').hidden = habits.length === 0;

  const sorted = [...habits].sort((a, b) => Number(isCompletedToday(a)) - Number(isCompletedToday(b)) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  sorted.forEach(habit => {
    const done = isCompletedToday(habit);
    const streak = streakFor(habit);
    const unit = habit.frequency === 'daily' ? 'day' : 'week';
    const card = document.createElement('article');
    card.className = `habit-card${done ? ' completed' : ''}`;
    card.innerHTML = `
      <div class="habit-main">
        <div class="habit-emoji">${escapeHtml(habit.emoji || '✦')}</div>
        <div>
          <div class="habit-title-row"><div class="habit-title">${escapeHtml(habit.name)}</div>${!isDueToday(habit) && habit.frequency === 'scheduled' ? '<span class="status-pill good">Not due</span>' : ''}</div>
          <div class="habit-meta">${escapeHtml(frequencyCopy(habit))}</div>
        </div>
        <button class="complete-button${done ? ' done' : ''}" data-complete="${habit.id}" aria-label="${done ? 'Undo completion' : 'Complete habit'}">✓</button>
      </div>
      ${renderWeekDots(habit)}
      <div class="habit-menu">
        <div class="streak-copy"><strong>${streak.current}</strong> ${unit}${streak.current === 1 ? '' : 's'} of momentum · ${streak.total} successful total</div>
        <button data-edit="${habit.id}">Edit</button>
      </div>
    `;
    list.appendChild(card);
  });

  renderMomentum();
}


function annualTarget(habit) {
  if (habit.frequency === 'daily') return 365;
  return Math.max(1, weekGoal(habit) * 52);
}

function completionsThisYear(habit) {
  const year = new Date().getFullYear();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  return habitCompletions(habit.id).filter(item => item.date >= start && item.date <= end).length;
}

function yearlyGardenInfo(habit) {
  const done = completionsThisYear(habit);
  const target = annualTarget(habit);
  const ratio = Math.min(1, done / target);
  let stage = 0;
  if (done > 0) stage = 1;
  if (ratio >= .04) stage = 2;
  if (ratio >= .12) stage = 3;
  if (ratio >= .28) stage = 4;
  if (ratio >= .5) stage = 5;
  if (ratio >= .75) stage = 6;
  return { done, target, ratio, stage };
}

function treeMarkup(stage) {
  if (stage === 0) return '<div class="garden-seed"><span></span></div>';
  if (stage === 1) return '<div class="garden-sprout"><i></i><b></b><em></em></div>';
  const canopy = stage >= 6 ? 7 : stage >= 5 ? 6 : stage >= 4 ? 5 : stage >= 3 ? 4 : 3;
  return `<div class="garden-tree stage-${stage}"><div class="tree-canopy">${Array.from({ length: canopy }, (_, i) => `<span class="leaf leaf-${i + 1}"></span>`).join('')}</div><div class="tree-trunk"></div>${stage >= 6 ? '<span class="tree-spark spark-a">✦</span><span class="tree-spark spark-b">✦</span>' : ''}</div>`;
}

function renderMomentum() {
  const section = $('#momentumSection');
  const list = $('#momentumList');
  section.hidden = habits.length === 0;
  list.innerHTML = '';
  habits.forEach(habit => {
    const streak = streakFor(habit);
    const unit = habit.frequency === 'daily' ? 'day' : 'week';
    const garden = yearlyGardenInfo(habit);
    const percent = Math.round(garden.ratio * 100);
    const card = document.createElement('div');
    card.className = 'momentum-card garden-card';
    card.innerHTML = `
      <div class="garden-visual">
        <div class="garden-sky">${treeMarkup(garden.stage)}<div class="garden-ground"></div></div>
      </div>
      <div class="garden-copy">
        <div class="momentum-name"><span>${escapeHtml(habit.emoji || '✦')}</span><span>${escapeHtml(habit.name)}</span></div>
        <div class="garden-stats"><strong>${garden.done}</strong> of ${garden.target} yearly repetitions</div>
        <div class="garden-progress"><span style="width:${percent}%"></span></div>
        <div class="garden-footer"><span>${percent}% of this year's ideal</span><span>${streak.current} ${unit}${streak.current === 1 ? '' : 's'} momentum</span></div>
      </div>
    `;
    list.appendChild(card);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

async function toggleCompletion(habitId) {
  const habit = habits.find(item => item.id === habitId);
  if (!habit) return;
  const date = localDateKey();
  const existing = completionForDate(habitId, date);
  if (existing) {
    await HabitDB.deleteCompletion(existing.id);
    completions = completions.filter(item => item.id !== existing.id);
    render();
    return;
  }
  const beforeMilestone = milestoneInfo(habit).value;
  const completion = { id: `${habitId}:${date}`, habitId, date, createdAt: new Date().toISOString() };
  await HabitDB.putCompletion(completion);
  completions.push(completion);
  const afterMilestone = milestoneInfo(habit).value;
  render();
  showCompletionCelebration(habit, beforeMilestone, afterMilestone);
}

function showCompletionCelebration(habit, beforeValue, afterValue) {
  const milestone = MILESTONES.includes(afterValue) && afterValue > beforeValue;
  const unit = habit.frequency === 'daily' ? 'day' : 'week';
  if (milestone) {
    $('#celebrationEmoji').textContent = afterValue >= 90 ? '💎' : afterValue >= 30 ? '🏆' : afterValue >= 7 ? '🌟' : '🌱';
    $('#celebrationLabel').textContent = `${afterValue}-${unit} milestone`;
    $('#celebrationTitle').textContent = afterValue === 1 ? 'It begins.' : `${afterValue} ${unit}${afterValue === 1 ? '' : 's'} of momentum.`;
    $('#celebrationText').textContent = afterValue >= 30 ? 'This pattern has history now. Keep making it easy to return.' : 'You are building familiarity through repetition, not perfection.';
  } else {
    const [title, text] = COMPLETION_MESSAGES[Math.floor(Math.random() * COMPLETION_MESSAGES.length)];
    $('#celebrationEmoji').textContent = ['✨', '✦', '🌱'][Math.floor(Math.random() * 3)];
    $('#celebrationLabel').textContent = habit.frequency === 'daily' ? 'Today counts' : `${weeklyCount(habit)}/${weekGoal(habit)} this week`;
    $('#celebrationTitle').textContent = title;
    $('#celebrationText').textContent = text;
  }
  const showTreat = milestone || Math.random() < 0.28;
  $('#treatCard').hidden = !showTreat;
  if (showTreat) {
    const [emoji, text] = TREATS[Math.floor(Math.random() * TREATS.length)];
    $('#treatEmoji').textContent = emoji;
    $('#treatText').textContent = text;
  }
  $('#celebrationDialog').showModal();
}

function setFrequency(type) {
  activeFrequency = type;
  $('#frequencyType').value = type;
  $$('#frequencyControl .segment').forEach(button => button.classList.toggle('active', button.dataset.frequency === type));
  $('#scheduledFields').hidden = type !== 'scheduled';
  $('#weeklyFields').hidden = type === 'daily' || type === 'scheduled';
  $('#minimumFields').hidden = type === 'daily';
  if (type === 'scheduled') $('#idealPerWeek').value = Math.max(1, selectedDays.size);
}

function openHabitForm(habit = null) {
  editingHabitId = habit?.id || null;
  $('#habitId').value = editingHabitId || '';
  $('#habitName').value = habit?.name || '';
  selectedIcon = habit?.emoji || '✦';
  $('#habitIconPreview').textContent = selectedIcon;
  $$('#iconPicker [data-icon]').forEach(item => item.classList.toggle('selected', item.dataset.icon === selectedIcon));
  $('#iconPicker').hidden = true;
  $('#habitIconButton').setAttribute('aria-expanded', 'false');
  selectedDays = new Set(habit?.days || []);
  $$('#dayPicker button').forEach(button => button.classList.toggle('selected', selectedDays.has(Number(button.dataset.day))));
  $('#idealPerWeek').value = habit?.idealPerWeek || 3;
  $('#minimumPerWeek').value = habit?.minimumPerWeek || 0;
  $('#formEyebrow').textContent = habit ? 'Edit habit' : 'New habit';
  $('#formTitle').textContent = habit ? habit.name : 'What do you want to repeat?';
  $('#deleteHabitButton').hidden = !habit;
  setFrequency(habit?.frequency || 'daily');
  $('#habitDialog').showModal();
  setTimeout(() => $('#habitName').focus(), 50);
}

async function saveHabit(event) {
  event.preventDefault();
  const name = $('#habitName').value.trim();
  if (!name) return;
  if (activeFrequency === 'scheduled' && selectedDays.size === 0) {
    $('#dayPicker').animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 180 });
    return;
  }
  const existing = habits.find(item => item.id === editingHabitId);
  const ideal = activeFrequency === 'scheduled' ? selectedDays.size : activeFrequency === 'flexible' ? Math.max(1, Number($('#idealPerWeek').value || 1)) : 7;
  const minimumRaw = activeFrequency === 'daily' ? 0 : Math.max(0, Number($('#minimumPerWeek').value || 0));
  const minimum = Math.min(minimumRaw, Math.max(0, ideal - 1));
  const habit = {
    id: editingHabitId || crypto.randomUUID(),
    name,
    emoji: selectedIcon || '✦',
    frequency: activeFrequency,
    days: activeFrequency === 'scheduled' ? [...selectedDays].sort((a, b) => a - b) : [],
    idealPerWeek: ideal,
    minimumPerWeek: minimum,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await HabitDB.putHabit(habit);
  const index = habits.findIndex(item => item.id === habit.id);
  if (index >= 0) habits[index] = habit;
  else habits.push(habit);
  $('#habitDialog').close();
  render();
}

async function deleteCurrentHabit() {
  if (!editingHabitId) return;
  const habit = habits.find(item => item.id === editingHabitId);
  if (!habit) return;
  if (!confirm(`Delete “${habit.name}” and its history?`)) return;
  await HabitDB.deleteHabit(editingHabitId);
  await HabitDB.deleteCompletionsForHabit(editingHabitId);
  habits = habits.filter(item => item.id !== editingHabitId);
  completions = completions.filter(item => item.habitId !== editingHabitId);
  $('#habitDialog').close();
  render();
}

async function exportBackup() {
  const backup = {
    app: 'habit-companion',
    version: 1,
    exportedAt: new Date().toISOString(),
    habits,
    completions
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `habit-companion-backup-${localDateKey()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importBackup(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (data.app !== 'habit-companion' || !Array.isArray(data.habits) || !Array.isArray(data.completions)) throw new Error('Invalid backup');
  if (!confirm('Replace the habits and history on this device with this backup?')) return;
  await HabitDB.replaceAll(data);
  habits = data.habits;
  completions = data.completions;
  $('#dataDialog').close();
  render();
}

function wireEvents() {
  $('#addHabitButton').addEventListener('click', () => openHabitForm());
  $('#floatingAddButton').addEventListener('click', () => openHabitForm());
  $('#emptyAddButton').addEventListener('click', () => openHabitForm());
  $('#habitForm').addEventListener('submit', saveHabit);
  $('#habitCloseButton').addEventListener('click', () => $('#habitDialog').close());
  $('#habitIconButton').addEventListener('click', () => {
    const picker = $('#iconPicker');
    picker.hidden = !picker.hidden;
    $('#habitIconButton').setAttribute('aria-expanded', String(!picker.hidden));
  });
  $('#iconPicker').addEventListener('click', event => {
    const button = event.target.closest('[data-icon]');
    if (!button) return;
    selectedIcon = button.dataset.icon;
    $('#habitIconPreview').textContent = selectedIcon;
    $$('#iconPicker [data-icon]').forEach(item => item.classList.toggle('selected', item.dataset.icon === selectedIcon));
    $('#iconPicker').hidden = true;
    $('#habitIconButton').setAttribute('aria-expanded', 'false');
  });
  $('#deleteHabitButton').addEventListener('click', deleteCurrentHabit);
  $('#celebrationClose').addEventListener('click', () => $('#celebrationDialog').close());
  $('#settingsButton').addEventListener('click', () => $('#dataDialog').showModal());
  $('#dataCloseButton').addEventListener('click', () => $('#dataDialog').close());
  $('#exportButton').addEventListener('click', exportBackup);
  $('#importButton').addEventListener('click', () => $('#importInput').click());
  $('#importInput').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await importBackup(file);
    } catch {
      alert('That file does not look like a Habit Companion backup.');
    } finally {
      event.target.value = '';
    }
  });
  $('#frequencyControl').addEventListener('click', event => {
    const button = event.target.closest('[data-frequency]');
    if (button) setFrequency(button.dataset.frequency);
  });
  $('#dayPicker').addEventListener('click', event => {
    const button = event.target.closest('[data-day]');
    if (!button) return;
    const day = Number(button.dataset.day);
    if (selectedDays.has(day)) selectedDays.delete(day);
    else selectedDays.add(day);
    button.classList.toggle('selected', selectedDays.has(day));
    if (activeFrequency === 'scheduled') $('#idealPerWeek').value = Math.max(1, selectedDays.size);
  });
  $$('.stepper').forEach(button => button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.stepTarget);
    const min = Number(input.min || 0);
    const max = Number(input.max || 99);
    input.value = Math.min(max, Math.max(min, Number(input.value || 0) + Number(button.dataset.step)));
  }));
  $('#habitList').addEventListener('click', event => {
    const completeButton = event.target.closest('[data-complete]');
    if (completeButton) toggleCompletion(completeButton.dataset.complete);
    const editButton = event.target.closest('[data-edit]');
    if (editButton) openHabitForm(habits.find(item => item.id === editButton.dataset.edit));
  });
  $('#iconPicker').innerHTML = HABIT_ICONS.map(icon => `<button type="button" data-icon="${icon}" aria-label="Use ${icon}">${icon}</button>`).join('');
  document.addEventListener('click', event => {
    if (!event.target.closest('#habitIconButton') && !event.target.closest('#iconPicker')) {
      $('#iconPicker').hidden = true;
      $('#habitIconButton').setAttribute('aria-expanded', 'false');
    }
  });
  [$('#habitDialog'), $('#dataDialog'), $('#celebrationDialog')].forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
  });
  $('#habitDialog').addEventListener('close', () => {
    $('#iconPicker').hidden = true;
    $('#habitIconButton').setAttribute('aria-expanded', 'false');
  });
}

async function init() {
  habits = await HabitDB.getAllHabits();
  completions = await HabitDB.getAllCompletions();
  wireEvents();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
}

init().catch(() => {
  document.body.innerHTML = '<main style="font-family:system-ui;padding:32px;max-width:600px;margin:auto"><h1>Storage unavailable</h1><p>Habit Companion needs browser storage enabled to keep your habits safely on this device.</p></main>';
});
