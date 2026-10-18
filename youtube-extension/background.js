// Service worker: makes the network requests content scripts can't make
// themselves (SponsorBlock and GIPHY search).
importScripts('defaults.js');

const SPONSOR_CATEGORIES = ['sponsor', 'selfpromo', 'interaction'];

async function sha256Hex(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// SponsorBlock's privacy-friendly lookup: only the first 4 characters of the
// video id's hash are sent, and the matching video is picked out locally.
async function sponsorSegments(videoId) {
  if (!/^[\w-]{11}$/.test(videoId || '')) return { segments: [] };
  const prefix = (await sha256Hex(videoId)).slice(0, 4);
  const url =
    'https://sponsor.ajay.app/api/skipSegments/' +
    prefix +
    '?categories=' +
    encodeURIComponent(JSON.stringify(SPONSOR_CATEGORIES));
  const res = await fetch(url);
  if (res.status === 404) return { segments: [] };
  if (!res.ok) throw new Error('SponsorBlock returned ' + res.status);
  const videos = await res.json();
  const match = videos.find((v) => v.videoID === videoId);
  const segments = (match ? match.segments : [])
    .filter((s) => (s.actionType || 'skip') === 'skip' && Array.isArray(s.segment) && s.segment[1] > s.segment[0])
    .map((s) => ({ segment: s.segment, category: s.category }));
  return { segments };
}

async function giphySearch(query) {
  const { giphyKey } = await chrome.storage.sync.get({ giphyKey: '' });
  if (!giphyKey) return { error: 'No GIPHY key set' };
  const url =
    'https://api.giphy.com/v1/gifs/search?limit=30&rating=pg-13&api_key=' +
    encodeURIComponent(giphyKey) +
    '&q=' +
    encodeURIComponent(String(query).slice(0, 50));
  const res = await fetch(url);
  if (res.status === 401 || res.status === 403) return { error: 'GIPHY rejected the key, check it in the popup' };
  if (!res.ok) return { error: 'GIPHY returned ' + res.status };
  const body = await res.json();
  return { ids: (body.data || []).map((g) => g.id).filter((id) => /^[A-Za-z0-9]{6,40}$/.test(id)) };
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  let work = null;
  if (message?.type === 'sponsorblock') work = sponsorSegments(message.videoId);
  else if (message?.type === 'giphySearch') work = giphySearch(message.query);
  if (!work) return false;
  work.then(reply, (err) => reply({ error: String(err?.message || err) }));
  return true;
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;
  await chrome.storage.local.set(YTP_STAT_DEFAULTS);
});
