// Extra player buttons: screenshot, loop, picture-in-picture and party mode.
(function () {
  'use strict';
  if (YTP.isLiveChat) return;

  const ICONS = {
    screenshot: [
      'M9 4 7.2 6H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.2L15 4H9zm3 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    ],
    loop: ['M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z'],
    pip: [
      'M3 4h18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v12h18V6H3zm9 5h7v5h-7v-5z',
    ],
    party: [
      'M10 2.5l1.9 5.6 5.6 1.9-5.6 1.9L10 17.5l-1.9-5.6L2.5 10l5.6-1.9L10 2.5z',
      'M18 13l.9 2.6 2.6.9-2.6.9L18 20l-.9-2.6-2.6-.9 2.6-.9L18 13z',
    ],
  };

  function videoTitle() {
    const heading = document.querySelector('ytd-watch-metadata h1, h1.ytd-watch-metadata');
    const title = (heading && heading.textContent.trim()) || document.title.replace(/ - YouTube$/, '');
    return title.replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'video';
  }

  function timestamp(seconds) {
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return (h ? h + 'h' : '') + m + 'm' + String(s % 60).padStart(2, '0') + 's';
  }

  function screenshot() {
    const video = YTP.getVideo();
    if (!video || !video.videoWidth) return YTP.toast('Nothing to capture yet');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return YTP.toast('Could not capture this frame');
      const url = URL.createObjectURL(blob);
      const link = YTP.h('a', { href: url, download: videoTitle() + ' ' + timestamp(video.currentTime) + '.png' });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      YTP.toast('Screenshot saved');
    }, 'image/png');
  }

  function toggleLoop() {
    const video = YTP.getVideo();
    if (!video) return;
    video.loop = !video.loop;
    YTP.toast(video.loop ? 'Loop on' : 'Loop off');
    refresh();
  }

  async function togglePip() {
    const video = YTP.getVideo();
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      YTP.toast('Picture-in-picture is not available here');
    }
  }

  function toggleParty() {
    const player = YTP.getPlayer();
    if (!player) return;
    const on = player.classList.toggle('ytp-plus-party');
    YTP.toast(on ? 'Party mode 🎉' : 'Party over');
    refresh();
  }

  const BUTTONS = [
    { key: 'party', title: 'Party mode', run: toggleParty },
    { key: 'loop', title: 'Loop', run: toggleLoop },
    { key: 'pip', title: 'Picture-in-picture', run: togglePip },
    { key: 'screenshot', title: 'Screenshot', run: screenshot },
  ];

  let group = null;

  function refresh() {
    if (!group) return;
    const video = YTP.getVideo();
    const player = YTP.getPlayer();
    group.querySelector('[data-key="loop"]')?.setAttribute('aria-pressed', String(!!video?.loop));
    group
      .querySelector('[data-key="party"]')
      ?.setAttribute('aria-pressed', String(!!player?.classList.contains('ytp-plus-party')));
  }

  function inject() {
    const controls = document.querySelector('#movie_player .ytp-right-controls');
    if (!controls) return;
    if (group && controls.contains(group)) return refresh();
    group = YTP.h(
      'span',
      { class: 'ytp-plus-buttons' },
      BUTTONS.map((b) =>
        YTP.h(
          'button',
          {
            class: 'ytp-button ytp-plus-btn',
            'data-key': b.key,
            title: b.title + ' (Premium+)',
            'aria-label': b.title,
            onclick: (e) => {
              e.stopPropagation();
              b.run();
            },
          },
          YTP.icon(...ICONS[b.key]),
        ),
      ),
    );
    const speed = YTP.getSpeedButton?.();
    if (speed && controls.contains(speed)) speed.after(group);
    else controls.prepend(group);
    refresh();
  }

  YTP.onSettings((s) => document.documentElement.classList.toggle('ytp-plus-buttons-on', !!s.playerButtons));
  YTP.observe(inject);
})();
