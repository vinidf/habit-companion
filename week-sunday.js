(() => {
  window.startOfWeek = function(date = new Date()) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    copy.setDate(copy.getDate() - copy.getDay());
    return copy;
  };

  function applySundayWeek() {
    const picker = document.getElementById('dayPicker');
    if (picker) {
      const sunday = picker.querySelector('[data-day="0"]');
      if (sunday && picker.firstElementChild !== sunday) picker.insertBefore(sunday, picker.firstElementChild);
    }
    if (typeof window.render === 'function') window.render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applySundayWeek);
  else applySundayWeek();
})();
