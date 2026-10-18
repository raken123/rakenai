// Settings shared by the background worker, the content scripts and the popup.
var YTP_DEFAULTS = {
  premiumLogo: true,
  logoText: 'Premium',
  adSkip: true,
  hideAds: true,
  hideUpsells: true,
  sponsorBlock: true,
  speedMenu: true,
  rememberSpeed: true,
  speed: 1,
  playerButtons: true,
  volumeBoost: 1,
  gifs: true,
  giphyKey: '',
  hideShorts: false,
  accentOn: false,
  accent: '#a259ff',
};

var YTP_STAT_DEFAULTS = {
  adsSkipped: 0,
  sponsorsSkipped: 0,
  secondsSaved: 0,
  gifsSent: 0,
};
