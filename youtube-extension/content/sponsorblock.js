// Skips sponsor reads, self-promotion and "like and subscribe" segments using
// the community SponsorBlock database (sponsor.ajay.app).
(function () {
  'use strict';
  if (YTP.isLiveChat) return;

  const NAMES = { sponsor: 'sponsor', selfpromo: 'self-promo', interaction: 'subscribe reminder' };

  let videoId = null;
  let segments = [];
  let lastTime = 0;
  // When each segment was last skipped, so a seek that doesn't stick can't
  // turn into a skip loop.
  const skippedAt = new Map();
  const watched = new WeakSet();

  async function load(id) {
    videoId = id;
    segments = [];
    lastTime = 0;
    skippedAt.clear();
    if (!id || !YTP.settings.sponsorBlock) return;
    const reply = await YTP.send({ type: 'sponsorblock', videoId: id });
    if (videoId === id && reply && Array.isArray(reply.segments)) segments = reply.segments;
  }

  function check(video) {
    const now = video.currentTime;
    const prev = lastTime;
    lastTime = now;
    if (!YTP.settings.sponsorBlock || YTP.isAdPlaying?.() || !segments.length) return;
    for (const seg of segments) {
      const [start, end] = seg.segment;
      // Only skip when playback runs into a segment, so seeking into one on
      // purpose lets you watch it.
      const ranInto = prev <= start + 0.5 && now >= start && now < end - 0.5;
      if (!ranInto || performance.now() - (skippedAt.get(seg) || -1e9) < 3000) continue;
      skippedAt.set(seg, performance.now());
      video.currentTime = end;
      lastTime = end;
      YTP.bumpStat('sponsorsSkipped', 1);
      YTP.bumpStat('secondsSaved', Math.round(end - now));
      YTP.toast('Skipped ' + (NAMES[seg.category] || 'segment') + ' (' + Math.round(end - now) + 's)');
      return;
    }
  }

  function tick() {
    const id = YTP.getVideoId();
    if (id !== videoId) load(id);
    const video = YTP.getVideo();
    if (!video || watched.has(video)) return;
    watched.add(video);
    video.addEventListener('timeupdate', () => check(video));
    video.addEventListener('seeked', () => (lastTime = video.currentTime));
  }

  YTP.onSettings((s, changed) => {
    if (changed.includes('sponsorBlock') && YTP.settingsLoaded) load(YTP.getVideoId());
  });
  YTP.observe(tick);
})();
