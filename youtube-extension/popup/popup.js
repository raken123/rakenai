'use strict';

const inputs = document.querySelectorAll('[data-key]');
const boostValue = document.getElementById('boost-value');

function showBoost(value) {
  boostValue.textContent = Math.round(Number(value) * 100) + '%';
}

function readInput(input) {
  if (input.type === 'checkbox') return input.checked;
  if (input.type === 'range') return Number(input.value);
  return input.value.trim();
}

chrome.storage.sync.get(YTP_DEFAULTS, (settings) => {
  for (const input of inputs) {
    const value = settings[input.dataset.key];
    if (input.type === 'checkbox') input.checked = !!value;
    else input.value = value;
  }
  showBoost(settings.volumeBoost);
  syncDisabled();
});

// Sub-options are greyed out while their parent switch is off.
function syncDisabled() {
  const on = (key) => document.querySelector(`[data-key="${key}"]`).checked;
  const pairs = { logoText: 'premiumLogo', accent: 'accentOn', rememberSpeed: 'speedMenu', giphyKey: 'gifs' };
  for (const [child, parent] of Object.entries(pairs)) {
    const input = document.querySelector(`[data-key="${child}"]`);
    input.disabled = !on(parent);
    input.closest('.row').classList.toggle('off', !on(parent));
  }
}

const timers = {};
for (const input of inputs) {
  const key = input.dataset.key;
  const save = () => chrome.storage.sync.set({ [key]: readInput(input) });
  if (input.type === 'text' || input.type === 'password' || input.type === 'range' || input.type === 'color') {
    // Save while typing or dragging, without hammering storage.
    input.addEventListener('input', () => {
      if (input.type === 'range') showBoost(input.value);
      clearTimeout(timers[key]);
      timers[key] = setTimeout(save, 250);
    });
  } else {
    input.addEventListener('change', () => {
      save();
      syncDisabled();
    });
  }
}

function formatDuration(seconds) {
  if (seconds < 60) return Math.round(seconds) + 's';
  if (seconds < 3600) return Math.round(seconds / 60) + 'm';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h + 'h' + (m ? ' ' + m + 'm' : '');
}

function showStats(stats) {
  document.getElementById('stat-ads').textContent = stats.adsSkipped.toLocaleString();
  document.getElementById('stat-sponsors').textContent = stats.sponsorsSkipped.toLocaleString();
  document.getElementById('stat-time').textContent = formatDuration(stats.secondsSaved);
  document.getElementById('stat-gifs').textContent = stats.gifsSent.toLocaleString();
}

chrome.storage.local.get(YTP_STAT_DEFAULTS, showStats);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') chrome.storage.local.get(YTP_STAT_DEFAULTS, showStats);
});
