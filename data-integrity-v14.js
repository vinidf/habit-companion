(() => {
  if (!window.HabitDB) return;
  const originalPutHabit = HabitDB.putHabit.bind(HabitDB);
  HabitDB.putHabit = async habit => {
    const all = await HabitDB.getAllHabits();
    const existing = all.find(item => item.id === habit.id);
    if (!habit.createdAt) habit.createdAt = existing?.createdAt || new Date().toISOString();
    if (!habit.startedAt) habit.startedAt = existing?.startedAt || existing?.createdAt || habit.createdAt;
    return originalPutHabit(habit);
  };
})();
