// The Premium logo, plus page-wide switches that are pure CSS (hide ads,
// hide upsells, hide Shorts, accent color).
(function () {
  'use strict';
  if (YTP.isLiveChat) return;

  const root = document.documentElement;

  YTP.onSettings((s) => {
    root.classList.toggle('ytp-plus-premium', !!s.premiumLogo);
    root.classList.toggle('ytp-plus-noads', !!s.hideAds);
    root.classList.toggle('ytp-plus-adskip', !!s.adSkip);
    root.classList.toggle('ytp-plus-noupsell', !!s.hideUpsells);
    root.classList.toggle('ytp-plus-noshorts', !!s.hideShorts);
    root.classList.toggle('ytp-plus-accent', !!s.accentOn);
    root.style.setProperty('--ytp-plus-accent', s.accent || YTP_DEFAULTS.accent);
    updateLogos();
  });

  // YouTube renders the logo twice (top bar and the slide-out menu) and may
  // re-render it at any time, so the word is re-added whenever it goes missing.
  function updateLogos() {
    const text = (YTP.settings.logoText || '').trim().slice(0, 24) || YTP_DEFAULTS.logoText;
    for (const renderer of document.querySelectorAll('ytd-topbar-logo-renderer')) {
      const link = renderer.querySelector('a#logo') || renderer.querySelector('a');
      if (!link) continue;
      let word = link.querySelector('.ytp-plus-premium-word');
      if (!word) {
        word = YTP.h('span', { class: 'ytp-plus-premium-word', 'aria-hidden': 'true' });
        const icon = link.querySelector('#logo-icon');
        if (icon) icon.after(word);
        else link.append(word);
      }
      if (word.textContent !== text) word.textContent = text;
    }
  }

  YTP.observe(updateLogos);
})();
