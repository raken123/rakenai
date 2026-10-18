// Shared state and helpers for every feature. All content scripts run in the
// same isolated world, so they talk to each other through the YTP object.
'use strict';

var YTP = (globalThis.YTP = globalThis.YTP || {});

(function () {
  YTP.settings = Object.assign({}, YTP_DEFAULTS);
  YTP.isLiveChat = location.pathname.startsWith('/live_chat');

  const settingsListeners = [];
  const observers = [];
  const events = {};

  // The extension can be reloaded while YouTube stays open. Old content scripts
  // then lose chrome.* access; stop quietly instead of throwing on every tick.
  YTP.alive = function () {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };

  YTP.onSettings = function (fn) {
    settingsListeners.push(fn);
    fn(YTP.settings, Object.keys(YTP.settings));
  };

  function notifySettings(changed) {
    for (const fn of settingsListeners) {
      try {
        fn(YTP.settings, changed);
      } catch (err) {
        console.error('[Premium+]', err);
      }
    }
  }

  chrome.storage.sync.get(YTP_DEFAULTS, (stored) => {
    Object.assign(YTP.settings, stored);
    YTP.settingsLoaded = true;
    notifySettings(Object.keys(stored));
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const changed = [];
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (!(key in YTP_DEFAULTS)) continue;
      YTP.settings[key] = newValue === undefined ? YTP_DEFAULTS[key] : newValue;
      changed.push(key);
    }
    if (changed.length) notifySettings(changed);
  });

  YTP.saveSetting = function (key, value) {
    if (YTP.alive()) chrome.storage.sync.set({ [key]: value });
  };

  YTP.on = function (name, fn) {
    (events[name] = events[name] || []).push(fn);
  };

  YTP.emit = function (name, data) {
    for (const fn of events[name] || []) fn(data);
  };

  // Stats are added up in memory and written at most once a second.
  const pendingStats = {};
  let statTimer = null;
  YTP.bumpStat = function (name, amount) {
    pendingStats[name] = (pendingStats[name] || 0) + amount;
    if (statTimer) return;
    statTimer = setTimeout(() => {
      statTimer = null;
      if (!YTP.alive()) return;
      const add = Object.assign({}, pendingStats);
      for (const key of Object.keys(pendingStats)) delete pendingStats[key];
      chrome.storage.local.get(YTP_STAT_DEFAULTS, (stats) => {
        for (const [key, value] of Object.entries(add)) stats[key] = (stats[key] || 0) + value;
        chrome.storage.local.set(stats);
      });
    }, 1000);
  };

  YTP.send = function (message) {
    return new Promise((resolve) => {
      if (!YTP.alive()) return resolve(null);
      try {
        chrome.runtime.sendMessage(message, (reply) => {
          void chrome.runtime.lastError;
          resolve(reply || null);
        });
      } catch {
        resolve(null);
      }
    });
  };

  // One MutationObserver for the whole page; features register a callback that
  // runs at most once per animation frame.
  let frameQueued = false;
  function runObservers() {
    frameQueued = false;
    if (!YTP.alive()) return;
    for (const fn of observers) {
      try {
        fn();
      } catch (err) {
        console.error('[Premium+]', err);
      }
    }
  }
  function queueObservers() {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(runObservers);
  }
  new MutationObserver(queueObservers).observe(document.documentElement, { childList: true, subtree: true });
  // requestAnimationFrame doesn't run in background tabs; keep things moving anyway.
  setInterval(queueObservers, 1000);

  YTP.observe = function (fn) {
    observers.push(fn);
    queueObservers();
  };

  YTP.getPlayer = function () {
    return document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
  };

  YTP.getVideo = function () {
    const player = YTP.getPlayer();
    return (player && player.querySelector('video.html5-main-video')) || (player && player.querySelector('video'));
  };

  YTP.getVideoId = function () {
    if (location.pathname === '/watch') return new URLSearchParams(location.search).get('v');
    const m = location.pathname.match(/^\/(?:live|embed)\/([\w-]{11})/);
    return m ? m[1] : null;
  };

  YTP.isTyping = function (target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  };

  // Tiny DOM builder. YouTube enforces Trusted Types, so markup strings and
  // innerHTML are off limits; everything is built from elements.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function build(ns, tag, attrs, children) {
    const el = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
      else if (key === 'text') el.textContent = value;
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else el.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      el.append(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return el;
  }

  YTP.h = function (tag, attrs, ...children) {
    return build(null, tag, attrs, children);
  };

  YTP.svg = function (tag, attrs, ...children) {
    return build(SVG_NS, tag, attrs, children);
  };

  // An icon from one or more 24x24 path strings.
  YTP.icon = function (...paths) {
    return YTP.svg(
      'svg',
      { viewBox: '0 0 24 24', class: 'ytp-plus-icon', 'aria-hidden': 'true' },
      paths.map((d) => YTP.svg('path', { d, fill: 'currentColor', 'fill-rule': 'evenodd' })),
    );
  };

  let toastTimer = null;
  YTP.toast = function (text) {
    const host = YTP.getPlayer() || document.body;
    if (!host) return;
    let toast = host.querySelector(':scope > .ytp-plus-toast');
    if (!toast) {
      toast = YTP.h('div', { class: 'ytp-plus-toast', role: 'status' });
      host.append(toast);
    }
    toast.textContent = text;
    toast.classList.add('ytp-plus-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('ytp-plus-show'), 1600);
  };

  YTP.formatSpeed = function (rate) {
    return (Math.round(rate * 100) / 100).toString() + 'x';
  };
})();
