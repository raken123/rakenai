// Skips video ads: while YouTube shows an ad the video is muted, sped up to
// 16x, jumped to its end, and the Skip button is pressed as soon as it exists.
(function () {
  'use strict';
  if (YTP.isLiveChat) return;

  const SKIP_BUTTONS = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot button',
    'button[id^="skip-button"]',
  ].join(',');

  let inAd = false;
  let wasMuted = false;
  let adStarted = 0;
  let adLength = 0;
  let adVideo = null;

  YTP.isAdPlaying = () => inAd;

  function isAdShowing(player) {
    return player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting');
  }

  function startAd(video) {
    inAd = true;
    adVideo = video;
    wasMuted = video.muted;
    adStarted = performance.now();
    adLength = 0;
    YTP.toast('Skipping ad…');
  }

  function endAd() {
    inAd = false;
    if (adVideo) adVideo.muted = wasMuted;
    adVideo = null;
    const spent = (performance.now() - adStarted) / 1000;
    YTP.bumpStat('adsSkipped', 1);
    YTP.bumpStat('secondsSaved', Math.max(0, Math.round((adLength || 15) - spent)));
    YTP.toast('Ad skipped');
    YTP.emit('adend');
  }

  function tick() {
    if (!YTP.alive()) return;
    const player = YTP.getPlayer();
    const video = YTP.getVideo();
    if (!player || !video || !YTP.settings.adSkip) {
      if (inAd) endAd();
      return;
    }
    if (!isAdShowing(player)) {
      if (inAd) endAd();
      return;
    }
    if (!inAd) startAd(video);
    video.muted = true;
    if (video.playbackRate !== 16) video.playbackRate = 16;
    if (Number.isFinite(video.duration)) adLength = Math.max(adLength, video.duration);
    if (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration - 0.3) {
      video.currentTime = video.duration - 0.1;
    }
    for (const button of document.querySelectorAll(SKIP_BUTTONS)) button.click();
  }

  setInterval(tick, 250);
  YTP.observe(tick);
})();
