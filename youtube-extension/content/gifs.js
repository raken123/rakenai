// GIFs in comments and live chat. A GIF button opens a picker; the chosen GIF
// goes into the comment as a [gif:ID] token, and anyone with Premium+ sees
// tokens and GIF links rendered as the actual GIF.
(function () {
  'use strict';

  const G = YTPGifCore;
  const RECENT_MAX = 12;

  // Text containers whose GIFs get rendered.
  const MESSAGE_SELECTORS = [
    'ytd-comment-view-model #content-text',
    'ytd-comment-renderer #content-text',
    'ytd-backstage-post-renderer #content-text',
    'yt-live-chat-text-message-renderer #message',
  ].join(',');

  YTP.onSettings((s) => {
    document.documentElement.classList.toggle('ytp-plus-gifs', !!s.gifs);
    if (!s.gifs) closePicker();
  });

  /* ---------- Rendering GIFs in comments and chat ---------- */

  const rows = new WeakMap();

  function linkUrls(el) {
    const urls = [];
    for (const a of el.querySelectorAll('a[href]')) {
      const url = G.gifFromUrl(a.href);
      if (url) urls.push(url);
    }
    return urls;
  }

  function renderMessage(el) {
    const signature = el.textContent + '|' + el.querySelectorAll('a[href]').length;
    if (el.dataset.ytpPlusSig === signature) return;

    const urls = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const found = G.gifsInText(node.data);
      if (!found.length) continue;
      urls.push(...found);
      node.data = G.stripTokens(node.data);
    }
    urls.push(...linkUrls(el));
    el.dataset.ytpPlusSig = el.textContent + '|' + el.querySelectorAll('a[href]').length;

    const old = rows.get(el);
    if (old) old.remove();
    rows.delete(el);
    if (!urls.length) return;

    const row = YTP.h(
      'div',
      { class: 'ytp-plus-gif-row' },
      [...new Set(urls)].slice(0, 4).map((src) =>
        YTP.h('img', { class: 'ytp-plus-gif', src, alt: 'GIF', loading: 'lazy', referrerpolicy: 'no-referrer' }),
      ),
    );
    // Long comments are clipped by the "Read more" expander; put GIFs after it.
    const host = el.closest('ytd-expander, #expander') || el;
    host.after(row);
    rows.set(el, row);
  }

  function renderAll() {
    if (!YTP.settings.gifs) return;
    for (const el of document.querySelectorAll(MESSAGE_SELECTORS)) renderMessage(el);
  }

  /* ---------- GIF buttons ---------- */

  function editorIn(box) {
    return box.querySelector('#contenteditable-root, div#input[contenteditable], [contenteditable="true"]');
  }

  function makeButton(box) {
    return YTP.h(
      'button',
      {
        type: 'button',
        class: 'ytp-plus-gif-btn',
        title: 'Send a GIF (Premium+)',
        'aria-label': 'Send a GIF',
        onmousedown: (e) => e.preventDefault(),
        onclick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (picker && pickerBox === box) closePicker();
          else openPicker(box, e.currentTarget);
        },
      },
      'GIF',
    );
  }

  function injectButtons() {
    if (!YTP.settings.gifs) return;
    for (const box of document.querySelectorAll('ytd-commentbox')) {
      if (box.querySelector('.ytp-plus-gif-btn')) continue;
      const emoji = box.querySelector('#emoji-button');
      const footer = box.querySelector('#footer');
      if (emoji) emoji.after(makeButton(box));
      else if (footer) footer.prepend(makeButton(box));
    }
    for (const box of document.querySelectorAll('yt-live-chat-message-input-renderer')) {
      if (box.querySelector('.ytp-plus-gif-btn')) continue;
      const pickers = box.querySelector('#picker-buttons');
      if (pickers) pickers.append(makeButton(box));
    }
  }

  /* ---------- The picker ---------- */

  let picker = null;
  let pickerBox = null;
  let savedRange = null;
  let searchTimer = null;
  let searchSeq = 0;

  function closePicker() {
    if (picker) picker.remove();
    picker = null;
    pickerBox = null;
    savedRange = null;
  }

  function saveSelection(editor) {
    const sel = getSelection();
    savedRange = editor && sel.rangeCount && editor.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
  }

  function insertIntoEditor(box, text) {
    const editor = editorIn(box);
    if (!editor) return false;
    editor.focus();
    const sel = getSelection();
    sel.removeAllRanges();
    if (savedRange && editor.contains(savedRange.startContainer)) {
      sel.addRange(savedRange);
    } else {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.addRange(range);
    }
    const before = editor.textContent;
    const space = before && !/\s$/.test(before) ? ' ' : '';
    // execCommand fires the input events YouTube listens for, so the Comment
    // button enables and the text is really part of the comment.
    if (!document.execCommand('insertText', false, space + text + ' ')) {
      editor.append(space + text + ' ');
      editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    return true;
  }

  function choose(text, recentKey) {
    const box = pickerBox;
    closePicker();
    if (!box || !insertIntoEditor(box, text)) return;
    YTP.bumpStat('gifsSent', 1);
    if (recentKey && YTP.alive()) {
      chrome.storage.local.get({ recentGifs: [] }, ({ recentGifs }) => {
        const list = [recentKey, ...recentGifs.filter((x) => x !== recentKey)].slice(0, RECENT_MAX);
        chrome.storage.local.set({ recentGifs: list });
      });
    }
  }

  function tile(id) {
    return YTP.h(
      'button',
      { type: 'button', class: 'ytp-plus-gif-tile', title: 'Send this GIF', onclick: () => choose('[gif:' + id + ']', id) },
      YTP.h('img', { src: G.giphyUrl(id, '200w'), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
    );
  }

  function showResults(grid, ids, emptyText) {
    grid.replaceChildren(...(ids.length ? ids.map(tile) : [YTP.h('div', { class: 'ytp-plus-gif-empty', text: emptyText })]));
  }

  async function search(query, grid, status) {
    const seq = ++searchSeq;
    const asInput = G.textForInput(query);
    if (asInput) {
      status.textContent = '';
      const src = asInput.startsWith('[gif:') ? G.gifsInText(asInput)[0] : asInput;
      grid.replaceChildren(
        YTP.h(
          'button',
          { type: 'button', class: 'ytp-plus-gif-tile ytp-plus-gif-wide', title: 'Send this GIF', onclick: () => choose(asInput) },
          YTP.h('img', { src, alt: '', referrerpolicy: 'no-referrer' }),
          YTP.h('span', { text: 'Send this GIF' }),
        ),
      );
      return;
    }

    if (YTP.settings.giphyKey && query.trim()) {
      status.textContent = 'Searching…';
      const reply = await YTP.send({ type: 'giphySearch', query: query.trim() });
      if (seq !== searchSeq) return;
      if (reply && reply.ids) {
        status.textContent = '';
        showResults(grid, reply.ids, 'No GIFs found');
        return;
      }
      status.textContent = (reply && reply.error) || 'GIPHY search failed, showing built-in GIFs';
    } else {
      status.textContent = '';
    }
    showResults(
      grid,
      G.searchBuiltIn(query).map((g) => g.id),
      'No built-in GIF matches. Add a GIPHY key in the Premium+ popup to search everything.',
    );
  }

  function openPicker(box, anchor) {
    closePicker();
    pickerBox = box;
    saveSelection(editorIn(box));

    const grid = YTP.h('div', { class: 'ytp-plus-gif-grid' });
    const status = YTP.h('div', { class: 'ytp-plus-gif-status' });
    const recent = YTP.h('div', { class: 'ytp-plus-gif-recent' });
    const input = YTP.h('input', {
      type: 'search',
      class: 'ytp-plus-gif-search',
      placeholder: YTP.settings.giphyKey ? 'Search GIPHY or paste a GIF link' : 'Search or paste a GIF link',
      oninput: () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => search(input.value, grid, status), 300);
      },
      onkeydown: (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') closePicker();
      },
    });

    picker = YTP.h(
      'div',
      { class: 'ytp-plus-gif-picker', role: 'dialog', 'aria-label': 'GIF picker' },
      YTP.h('div', { class: 'ytp-plus-gif-head' }, input, YTP.h('button', { type: 'button', class: 'ytp-plus-gif-close', 'aria-label': 'Close', onclick: closePicker, text: '×' })),
      recent,
      status,
      grid,
      YTP.h('div', { class: 'ytp-plus-gif-foot', text: YTP.settings.giphyKey ? 'Powered by GIPHY' : 'GIFs via GIPHY' }),
    );
    document.body.append(picker);

    // Place it above the button, or below if there's no room.
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 16);
    picker.style.width = width + 'px';
    picker.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
    const height = Math.min(420, window.innerHeight - 16);
    picker.style.maxHeight = height + 'px';
    if (rect.top > height + 12) picker.style.bottom = window.innerHeight - rect.top + 6 + 'px';
    else picker.style.top = Math.min(rect.bottom + 6, window.innerHeight - height - 8) + 'px';

    if (YTP.alive()) {
      chrome.storage.local.get({ recentGifs: [] }, ({ recentGifs }) => {
        if (!picker || !recentGifs.length) return;
        recent.replaceChildren(YTP.h('div', { class: 'ytp-plus-gif-label', text: 'Recent' }), YTP.h('div', { class: 'ytp-plus-gif-strip' }, recentGifs.map(tile)));
      });
    }
    search('', grid, status);
    input.focus();
  }

  document.addEventListener(
    'mousedown',
    (e) => {
      if (picker && !picker.contains(e.target) && !e.target.closest?.('.ytp-plus-gif-btn')) closePicker();
    },
    true,
  );
  window.addEventListener('resize', closePicker);

  YTP.observe(() => {
    if (!YTP.settings.gifs) return;
    injectButtons();
    renderAll();
  });
})();
