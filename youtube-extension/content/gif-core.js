// Pure GIF helpers: no DOM, no chrome.* calls, so they can be unit tested in Node.
(function (root) {
  'use strict';

  // A GIF is sent as a short token like [gif:3o7TKSjRrfIPjeiVyM]. Comments with
  // links are often held for review by YouTube's spam filter; a token is not a link.
  const TOKEN_RE = /\[gif:([A-Za-z0-9]{6,40})\]/g;
  const GIPHY_ID_RE = /^[A-Za-z0-9]{6,40}$/;

  // Hosts that are allowed to show images inside comments. Anything else is
  // ignored so a comment can't make your browser load a tracking pixel.
  const IMAGE_HOSTS = /^(media\d?\.giphy\.com|i\.giphy\.com|media\d?\.tenor\.com|c\.tenor\.com|i\.imgur\.com)$/;

  const BUILT_IN = [
    { id: '111ebonMs90YLu', tags: 'thumbs up yes ok nice good' },
    { id: '10JhviFuU2gWD6', tags: 'lol laugh haha funny' },
    { id: 'ZqlvCTNHpqrio', tags: 'minions whoa wow laugh' },
    { id: 'xT0xeJpnrWC4XWblEk', tags: 'mind blown wow amazing' },
    { id: '3o7TKSjRrfIPjeiVyM', tags: 'mind blown science wow' },
    { id: '5VKbvrjxpVJCM', tags: 'shocked surprised omg what' },
    { id: '26BRv0ThflsHCqDrG', tags: 'love heart cute' },
    { id: '26gsjCZpPolPr3sBy', tags: 'thank you thanks' },
    { id: '26u4cqiYI30juCOGY', tags: 'celebrate party confetti yay win' },
    { id: 'kyLYXonQYYfwYDIeZl', tags: 'party elmo birthday celebrate' },
    { id: 'nbvFVPiEiJH6JOGIok', tags: 'applause clap bravo' },
    { id: '7rj2ZgttvgomY', tags: 'slow clap applause' },
    { id: 'BPJmthQ3YRwD6QqcVD', tags: 'cheers toast leo congrats' },
    { id: 'g9582DNuQppxC', tags: 'cheers toast leo congrats' },
    { id: 'pUeXcg80cO8I8', tags: 'popcorn drama watching' },
    { id: 'tyqcJoNjNv0Fq', tags: 'popcorn drama watching' },
    { id: 'QMHoU66sBXqqLqYvGO', tags: 'this is fine fire dog' },
    { id: '26ybwvTX4DTkwst6U', tags: 'at least you tried fail simpsons' },
    { id: '3o7btPCcdNniyf0ArS', tags: 'confused math thinking' },
    { id: 'l0HlvtIPzPdt2usKs', tags: 'side eye suspicious sus' },
    { id: '9Y5BbDSkSTiY8', tags: 'sad cry baby upset' },
    { id: 'OPU6wzx8JrHna', tags: 'crying sad patrick spongebob' },
    { id: 'tXL4FHPSnVJ0A', tags: 'bored waiting' },
    { id: 'QBd2kLB5qDmysEXre9', tags: 'waiting mr bean where' },
    { id: 'ISOckXUybVfQ4', tags: 'waiting alone spongebob lonely' },
    { id: '3oEjI6SIIHBdRxXI40', tags: 'loading buffering wait' },
    { id: '3o7abKhOpu0NwenH3O', tags: 'imagination rainbow spongebob' },
    { id: 'l46CyJmS9KUbokzsI', tags: 'building working patrick spongebob' },
    { id: 'blSTtZehjAZ8I', tags: 'dance dancing kid groove' },
    { id: '13CoXDiaCcCoyk', tags: 'shimmy dance shaq' },
    { id: 'dzaUX7CAG0Ihi', tags: 'hello hi bear wave' },
    { id: 'xT9IgG50Fb7Mi0prBC', tags: 'bye wave goodbye hi forrest' },
    { id: 'JIX9t2j0ZTN9S', tags: 'cat typing working computer' },
    { id: 'LmNwrBhejkK9EFP504', tags: 'cat typing working computer' },
    { id: 'VbnUQpnihPSIgIXuZv', tags: 'cat nerd glasses computer' },
    { id: 'mlvseq9yvZhba', tags: 'cat sassy nails whatever' },
    { id: '3oriO0OEd9QIDdllqo', tags: 'cat kitten cute' },
    { id: 'MDJ9IbxxvDUQM', tags: 'cat shocked surprised' },
  ];

  function giphyUrl(id, size) {
    return 'https://media.giphy.com/media/' + id + '/' + (size || 'giphy') + '.gif';
  }

  function parseUrl(href) {
    try {
      return new URL(href);
    } catch {
      return null;
    }
  }

  // YouTube wraps outbound links as /redirect?q=<real url>.
  function unwrapRedirect(href) {
    const url = parseUrl(href);
    if (url && /(^|\.)youtube\.com$/.test(url.hostname) && url.pathname === '/redirect') {
      return url.searchParams.get('q') || href;
    }
    return href;
  }

  function giphyIdFromUrl(url) {
    const host = url.hostname;
    const path = url.pathname;
    let m;
    if (host === 'giphy.com' || host === 'www.giphy.com') {
      // giphy.com/gifs/some-slug-ID, giphy.com/gifs/ID, giphy.com/embed/ID
      m = path.match(/^\/(?:gifs|embed|stickers)\/(?:[^/]*-)?([A-Za-z0-9]+)\/?$/);
    } else if (/^media\d?\.giphy\.com$/.test(host)) {
      // media.giphy.com/media/ID/giphy.gif, media0.giphy.com/media/v1.xyz/ID/200w.gif
      m = path.match(/^\/media\/(?:v1\.[^/]+\/)?([A-Za-z0-9]+)\//);
    } else if (host === 'i.giphy.com') {
      m = path.match(/^\/(?:media\/)?([A-Za-z0-9]+)(?:\.gif|\/)/);
    }
    return m && GIPHY_ID_RE.test(m[1]) ? m[1] : null;
  }

  // Returns a safe image URL for a link, or null if the link isn't a GIF we show.
  function gifFromUrl(href) {
    const url = parseUrl(unwrapRedirect(href));
    if (!url || url.protocol !== 'https:') return null;
    const giphyId = giphyIdFromUrl(url);
    if (giphyId) return giphyUrl(giphyId);
    if (IMAGE_HOSTS.test(url.hostname) && /\.(gif|webp)$/i.test(url.pathname)) {
      return url.origin + url.pathname;
    }
    return null;
  }

  // Turns whatever the user pasted (a GIPHY id, a GIPHY page, a .gif link) into
  // the text that goes into the comment, or null if it isn't usable.
  function textForInput(input) {
    const value = String(input || '').trim();
    if (!value) return null;
    // A bare GIPHY id: mixed case or digits, so plain search words don't match.
    if (GIPHY_ID_RE.test(value) && value.length >= 8 && (/[0-9]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value)))) {
      return '[gif:' + value + ']';
    }
    const url = parseUrl(value);
    if (!url) return null;
    const giphyId = giphyIdFromUrl(url);
    if (giphyId) return '[gif:' + giphyId + ']';
    const img = gifFromUrl(value);
    return img || null;
  }

  // All GIF tokens in a piece of text, as image URLs, in order.
  function gifsInText(text) {
    const out = [];
    for (const m of String(text).matchAll(TOKEN_RE)) out.push(giphyUrl(m[1]));
    return out;
  }

  function stripTokens(text) {
    return String(text).replace(TOKEN_RE, '');
  }

  function searchBuiltIn(query) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return BUILT_IN.slice();
    return BUILT_IN.filter((g) => words.every((w) => g.tags.includes(w)));
  }

  root.YTPGifCore = {
    TOKEN_RE,
    BUILT_IN,
    giphyUrl,
    unwrapRedirect,
    gifFromUrl,
    textForInput,
    gifsInText,
    stripTokens,
    searchBuiltIn,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
