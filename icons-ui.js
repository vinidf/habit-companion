(() => {
  const icons = {
    '✦': ['General', '<path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z"/><path d="M18.5 14.5l.8 2 .2.5.5.2 2 .8-2 .8-.5.2-.2.5-.8 2-.8-2-.2-.5-.5-.2-2-.8 2-.8.5-.2.2-.5.8-2Z"/>'],
    '🎹': ['Piano', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v9M11 5v9M15 5v9M19 5v9"/><path d="M6 5v6h2V5M10 5v6h2V5M18 5v6h-2V5"/>'],
    '🎵': ['Music', '<path d="M9 18V7l10-2v10"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/><path d="M9 10l10-2"/>'],
    '🏋️': ['Strength', '<path d="M7 9v6M17 9v6M4 10v4M20 10v4M7 12h10"/><path d="M2.5 9v6M21.5 9v6"/>'],
    '🏃': ['Run', '<circle cx="14.5" cy="5" r="2"/><path d="M12 9l3 2 3-1M12 9l-2 4 3 2M13 15l-3 5M14 14l4 5M10 13l-3-1"/>'],
    '🚶': ['Walk', '<circle cx="12" cy="5" r="2"/><path d="M12 8v5M12 10l-3 3M12 10l3 2M12 13l-3 7M12 13l4 7"/>'],
    '🏊': ['Swim', '<circle cx="8" cy="9" r="2"/><path d="M10 11l4 2 4-2M4 16c1.5-1 3-.9 4.5 0s3 .9 4.5 0 3-.9 4.5 0 3 .9 4.5 0M3 20c1.5-1 3-.9 4.5 0s3 .9 4.5 0 3-.9 4.5 0 3 .9 4.5 0"/>'],
    '🚲': ['Cycling', '<circle cx="6" cy="17" r="4"/><circle cx="18" cy="17" r="4"/><path d="M6 17l4-8h4l4 8M10 9l4 8H6M12 9l-1.5-3H8M14 9h3"/>'],
    '📚': ['Reading', '<path d="M4 5.5c3-.8 5-.2 8 1.5v12c-3-1.7-5-2.3-8-1.5v-12ZM20 5.5c-3-.8-5-.2-8 1.5v12c3-1.7 5-2.3 8-1.5v-12Z"/><path d="M12 7v12"/>'],
    '🧠': ['Focus', '<path d="M9 5.5A3 3 0 0 1 14 4a3 3 0 0 1 4 3 3 3 0 0 1 1 5 3 3 0 0 1-2 5 3 3 0 0 1-5 2 3 3 0 0 1-5-2 3 3 0 0 1-2-5 3 3 0 0 1 1-5 3 3 0 0 1 3-1.5Z"/><path d="M12 5v14M8 9c2 0 3 1 4 2M16 9c-2 0-3 1-4 2M8 15c2 0 3-1 4-2M16 15c-2 0-3-1-4-2"/>'],
    '🗣️': ['Language', '<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/>'],
    '🌏': ['World', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9M12 3c-3 3-4 6-4 9s1 6 4 9"/>'],
    '💧': ['Water', '<path d="M12 3s6 7 6 11a6 6 0 1 1-12 0c0-4 6-11 6-11Z"/><path d="M9 15c.5 1.5 1.5 2 3 2"/>'],
    '🥗': ['Nutrition', '<path d="M4 11h16c0 5-3 8-8 8s-8-3-8-8Z"/><path d="M8 10c-1-3 1-5 4-5 0 3-1 5-4 5ZM13 10c0-3 2-5 5-5 0 3-2 5-5 5Z"/>'],
    '🦷': ['Dental care', '<path d="M8 4c1.5 0 2.5 1 4 1s2.5-1 4-1c3 0 4.5 2.5 4 5.5-.5 3-2 4.5-3 7.5-.7 2-1.5 3-2.5 3-1.5 0-1.5-5-2.5-5s-1 5-2.5 5c-1 0-1.8-1-2.5-3-1-3-2.5-4.5-3-7.5C3.5 6.5 5 4 8 4Z"/>'],
    '😴': ['Sleep', '<path d="M18 15.5A8 8 0 0 1 8.5 6 8 8 0 1 0 18 15.5Z"/><path d="M16 5h4l-4 4h4"/>'],
    '🧘': ['Meditation', '<circle cx="12" cy="6" r="2"/><path d="M12 9v5M12 11l-4 3M12 11l4 3M8 14l-4 5h8M16 14l4 5h-8"/>'],
    '🧹': ['Cleaning', '<path d="M14 3L8 15M7 14l7 4M5 17l7 4 3-5-7-4-3 5Z"/>'],
    '🐕': ['Pet care', '<circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/><circle cx="5" cy="13" r="2"/><circle cx="19" cy="13" r="2"/><path d="M12 11c-3 0-5 2.5-5 5 0 2 1.5 3 3 3 .8 0 1.2-.5 2-.5s1.2.5 2 .5c1.5 0 3-1 3-3 0-2.5-2-5-5-5Z"/>'],
    '💊': ['Medicine', '<path d="M8 17l8-8a4 4 0 0 0-6-6l-8 8a4 4 0 0 0 6 6Z"/><path d="M6 7l6 6"/>'],
    '☀️': ['Outdoors', '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>'],
    '✍️': ['Writing', '<path d="M4 20h5L20 9a2.8 2.8 0 0 0-4-4L5 16l-1 4Z"/><path d="M14 7l4 4M4 20l4-4"/>'],
    '💻': ['Computer', '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 19h20M9 16l-1 3M15 16l1 3"/>'],
    '🎨': ['Creative', '<path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h4a5 5 0 0 0 0-10h-4Z"/><circle cx="7.5" cy="9" r="1"/><circle cx="10" cy="6" r="1"/><circle cx="7" cy="13" r="1"/>']
  };

  function svg(key) {
    const entry = icons[key] || icons['✦'];
    return `<svg class="habit-line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${entry[1]}</svg>`;
  }

  function enhancePicker() {
    document.querySelectorAll('#iconPicker [data-icon]').forEach(button => {
      const key = button.dataset.icon;
      const entry = icons[key];
      if (!entry || button.dataset.vectorized === '1') return;
      button.innerHTML = svg(key);
      button.setAttribute('aria-label', entry[0]);
      button.title = entry[0];
      button.dataset.vectorized = '1';
    });
  }

  function enhanceNode(node) {
    if (!node) return;
    const raw = node.textContent.trim();
    if (!icons[raw]) return;
    node.dataset.iconKey = raw;
    node.innerHTML = svg(raw);
    node.setAttribute('aria-label', icons[raw][0]);
  }

  function enhanceVisibleIcons(root = document) {
    enhancePicker();
    root.querySelectorAll?.('.habit-emoji, #habitIconPreview').forEach(enhanceNode);
    root.querySelectorAll?.('.momentum-name > span:first-child').forEach(enhanceNode);
  }

  const style = document.createElement('style');
  style.textContent = `.habit-line-icon{width:26px;height:26px;display:block}.habit-emoji .habit-line-icon{width:27px;height:27px}.momentum-name .habit-line-icon{width:19px;height:19px;color:var(--primary-deep)}#habitIconPreview{display:grid;place-items:center}#habitIconPreview .habit-line-icon{width:25px;height:25px}.icon-picker button{color:#4d5870}.icon-picker button.selected{color:var(--primary-deep)}.icon-picker button .habit-line-icon{width:25px;height:25px}.icon-trigger{color:#4d5870}`;
  document.head.appendChild(style);

  const observer = new MutationObserver(mutations => {
    let relevant = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' || mutation.type === 'characterData') {
        relevant = true;
        break;
      }
    }
    if (relevant) requestAnimationFrame(() => enhanceVisibleIcons(document));
  });

  function start() {
    enhanceVisibleIcons(document);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
