// Playback speeds past YouTube's 2x limit: a speed button in the player, a
// menu up to 16x, and Shift+> / Shift+< keep stepping past 2x.
(function () {
  'use strict';
  if (YTP.isLiveChat) return;

  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 8, 16];
  const NOTES = { 3: 'Premium', 4: 'speedrun', 8: 'for no reason', 16: 'pure chaos' };

  // The speed the user picked. null means "whatever YouTube picks".
  let wanted = null;
  // After a new video loads YouTube resets the speed; within this window a
  // speed change is YouTube's doing, not the user's, so it gets undone.
  let guardUntil = 0;
  const watched = new WeakSet();
  let button = null;
  let menu = null;

  function guard(ms) {
    guardUntil = performance.now() + (ms || 3000);
  }

  function close(a, b) {
    return Math.abs(a - b) < 0.001;
  }

  function apply() {
    const video = YTP.getVideo();
    if (!video || wanted == null || YTP.isAdPlaying?.()) return;
    if (!close(video.playbackRate, wanted)) video.playbackRate = wanted;
    updateButton();
  }

  function setSpeed(rate) {
    wanted = rate;
    guard(0);
    apply();
    if (YTP.settings.rememberSpeed) YTP.saveSetting('speed', rate);
    YTP.toast(YTP.formatSpeed(rate) + (NOTES[rate] ? ' — ' + NOTES[rate] : ''));
  }

  function watch(video) {
    if (watched.has(video)) return;
    watched.add(video);
    video.addEventListener('ratechange', () => {
      if (YTP.isAdPlaying?.()) return;
      if (wanted != null && !close(video.playbackRate, wanted)) {
        if (performance.now() < guardUntil) {
          apply();
          return;
        }
        // The user changed speed with YouTube's own menu or shortcuts.
        wanted = video.playbackRate;
        if (YTP.settings.rememberSpeed) YTP.saveSetting('speed', wanted);
      }
      updateButton();
    });
    video.addEventListener('loadstart', () => guard());
    video.addEventListener('loadeddata', apply);
    video.addEventListener('playing', apply);
  }

  YTP.on('adend', () => {
    guard();
    apply();
  });

  document.addEventListener('yt-navigate-start', () => {
    guard();
    if (!YTP.settings.rememberSpeed) wanted = null;
  });
  document.addEventListener('yt-navigate-finish', () => {
    guard();
    apply();
  });

  let started = false;
  YTP.onSettings((s) => {
    if (!started && YTP.settingsLoaded) {
      started = true;
      if (s.rememberSpeed && s.speed > 0 && s.speed <= 16) {
        wanted = s.speed;
        guard();
        apply();
      }
    }
    document.documentElement.classList.toggle('ytp-plus-speed', !!s.speedMenu);
    if (!s.speedMenu) closeMenu();
  });

  // Shift+> past 2x and Shift+< back down. Below 2x YouTube handles it itself.
  window.addEventListener(
    'keydown',
    (e) => {
      if (!YTP.settings.speedMenu || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== '>' && e.key !== '<') return;
      if (YTP.isTyping(e.target) || location.pathname !== '/watch') return;
      const video = YTP.getVideo();
      if (!video) return;
      const now = video.playbackRate;
      let next = null;
      if (e.key === '>' && now >= 2 - 0.001) next = SPEEDS.find((s) => s > now + 0.001);
      if (e.key === '<' && now > 2 + 0.001) next = [...SPEEDS].reverse().find((s) => s < now - 0.001);
      if (next == null) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setSpeed(next);
    },
    true,
  );

  function updateButton() {
    if (!button) return;
    const video = YTP.getVideo();
    const rate = video ? video.playbackRate : 1;
    const label = YTP.formatSpeed(YTP.isAdPlaying?.() ? wanted || 1 : rate);
    if (button.textContent !== label) button.textContent = label;
    button.classList.toggle('ytp-plus-fast', rate > 2 && !YTP.isAdPlaying?.());
    if (menu) {
      for (const item of menu.querySelectorAll('[data-rate]')) {
        item.setAttribute('aria-checked', String(close(Number(item.dataset.rate), rate)));
      }
    }
  }

  function closeMenu() {
    if (menu) menu.remove();
    menu = null;
  }

  function openMenu() {
    const player = YTP.getPlayer();
    if (!player) return;
    menu = YTP.h(
      'div',
      { class: 'ytp-plus-menu', role: 'menu' },
      YTP.h('div', { class: 'ytp-plus-menu-title', text: 'Playback speed' }),
      [...SPEEDS].reverse().map((rate) =>
        YTP.h(
          'button',
          {
            class: 'ytp-plus-menu-item',
            role: 'menuitemradio',
            'data-rate': rate,
            onclick: (e) => {
              e.stopPropagation();
              setSpeed(rate);
              closeMenu();
            },
          },
          YTP.h('span', { text: rate === 1 ? 'Normal' : YTP.formatSpeed(rate) }),
          NOTES[rate] ? YTP.h('span', { class: 'ytp-plus-menu-note', text: NOTES[rate] }) : null,
        ),
      ),
    );
    player.append(menu);
    updateButton();
  }

  document.addEventListener(
    'click',
    (e) => {
      if (menu && !menu.contains(e.target) && e.target !== button) closeMenu();
    },
    true,
  );

  function inject() {
    const video = YTP.getVideo();
    if (video) watch(video);
    const controls = document.querySelector('#movie_player .ytp-right-controls');
    if (!controls) return;
    if (button && controls.contains(button)) {
      updateButton();
      return;
    }
    button = YTP.h('button', {
      class: 'ytp-button ytp-plus-speed-btn',
      title: 'Playback speed (Premium+)',
      'aria-label': 'Playback speed',
      onclick: (e) => {
        e.stopPropagation();
        if (menu) closeMenu();
        else openMenu();
      },
    });
    controls.prepend(button);
    updateButton();
  }

  YTP.observe(inject);
  YTP.getSpeedButton = () => button;
})();
