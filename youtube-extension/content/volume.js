// Volume booster: routes the video through a Web Audio gain node so it can go
// past 100%. The audio graph is only built once a boost is actually wanted.
(function () {
  'use strict';
  if (YTP.isLiveChat) return;

  let ctx = null;
  const gains = new WeakMap();

  function apply() {
    const boost = Number(YTP.settings.volumeBoost) || 1;
    const video = YTP.getVideo();
    if (!video) return;
    let gain = gains.get(video);
    if (!gain) {
      if (boost <= 1) return;
      // An AudioContext made before the user has interacted with the page
      // starts suspended and would silence the video, so wait for a click.
      if (!navigator.userActivation?.hasBeenActive) return;
      try {
        ctx = ctx || new AudioContext();
        const source = ctx.createMediaElementSource(video);
        gain = ctx.createGain();
        source.connect(gain).connect(ctx.destination);
        gains.set(video, gain);
      } catch (err) {
        console.warn('[Premium+] volume boost unavailable', err);
        return;
      }
    }
    if (gain.gain.value !== boost) gain.gain.value = boost;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  YTP.onSettings((s, changed) => {
    if (!changed.includes('volumeBoost')) return;
    apply();
    if (YTP.settingsLoaded && changed.length === 1) {
      YTP.toast('Volume boost ' + Math.round((Number(s.volumeBoost) || 1) * 100) + '%');
    }
  });
  for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, apply, true);
  YTP.observe(apply);
})();
