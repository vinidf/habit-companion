(() => {
  const earlyFeedback = [
    [1, 'It begins.', 'The first repetition is how the pattern gets started.'],
    [2, 'Two is a pattern.', 'You came back again. That is already different from a one-off.'],
    [3, 'You are building it.', 'Three repetitions give the habit another place to land.'],
    [4, 'A little more familiar.', 'Keep repeating before you worry about making it perfect.'],
    [5, 'Five repetitions.', 'The path is getting easier to recognize.'],
    [7, 'One week.', 'You have given this habit a full week of evidence.'],
    [10, 'Ten repetitions.', 'Small returns are starting to become a pattern.'],
    [14, 'Two weeks.', 'The habit has had time to become more familiar.'],
    [21, 'Three weeks.', 'You have repeated this enough to give it real momentum.'],
    [30, 'Thirty repetitions.', 'A month of showing up is meaningful progress.']
  ];

  async function completionCount(habitId) {
    try {
      const all = await HabitDB.getAllCompletions();
      return all.filter(item => item.habitId === habitId).length;
    } catch {
      return 0;
    }
  }

  async function updateCelebration() {
    const dialog = document.querySelector('#celebrationDialog');
    if (!dialog?.open || !window.__lastCompletedHabitId) return;
    const count = await completionCount(window.__lastCompletedHabitId);
    const message = earlyFeedback.find(item => item[0] === count);
    if (!message) return;
    const label = document.querySelector('#celebrationLabel');
    const title = document.querySelector('#celebrationTitle');
    const text = document.querySelector('#celebrationText');
    if (label) label.textContent = count === 1 ? 'First repetition' : `${count} repetitions`;
    if (title) title.textContent = message[1];
    if (text) text.textContent = message[2];
  }

  const originalShowModal = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function(...args) {
    const result = originalShowModal.apply(this, args);
    if (this.id === 'celebrationDialog') setTimeout(updateCelebration, 0);
    return result;
  };

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-complete]');
    if (!button) return;
    window.__lastCompletedHabitId = button.dataset.complete;
    setTimeout(updateCelebration, 150);
  });
})();
