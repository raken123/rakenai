// Shows the files that Code, Work and Vidful make: previews, source view,
// downloads (single files or a .zip) and a Brainfuck runner.
import { renderMarkdown } from './markdown.js';

const MIME = {
  html: 'text/html',
  htm: 'text/html',
  svg: 'image/svg+xml',
  css: 'text/css',
  js: 'text/javascript',
  json: 'application/json',
  csv: 'text/csv',
  md: 'text/markdown',
};

const ext = (path) => path.split('.').pop().toLowerCase();
const mimeOf = (path) => MIME[ext(path)] ?? 'text/plain';
const baseName = (path) => path.split('/').pop();

export function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
}

// Saves a file. Inside the Android app, the native side writes it to Downloads.
export async function saveFile(name, blob) {
  if (window.RakenAndroid?.saveFile) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    window.RakenAndroid.saveFile(name, blob.type || 'application/octet-stream', btoa(binary));
    return;
  }
  const url = URL.createObjectURL(blob);
  el('a', { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// --- .zip (stored, no compression) ---

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function zip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = enc.encode(file.path);
    const data = enc.encode(file.content);
    const crc = crc32(data);
    const header = (sig, extra) => {
      const view = new DataView(new ArrayBuffer(extra ? 46 : 30));
      let p = 0;
      const u32 = (v) => { view.setUint32(p, v, true); p += 4; };
      const u16 = (v) => { view.setUint16(p, v, true); p += 2; };
      u32(sig);
      if (extra) u16(20);
      u16(20); u16(0x0800); u16(0); u16(0); u16(0x21);
      u32(crc); u32(data.length); u32(data.length);
      u16(name.length); u16(0);
      if (extra) { u16(0); u16(0); u16(0); u32(0); u32(offset); }
      return new Uint8Array(view.buffer);
    };
    const local = header(0x04034b50, false);
    parts.push(local, name, data);
    central.push(header(0x02014b50, true), name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = central.reduce((n, a) => n + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

// --- Brainfuck ---

const BF_WORKER = `onmessage = ({ data: { code, input } }) => {
  const tape = new Uint8Array(30000); let ptr = 0, ip = 0, inp = 0, steps = 0, out = '';
  const jump = new Int32Array(code.length), stack = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '[') stack.push(i);
    else if (code[i] === ']') { if (!stack.length) return postMessage({ error: 'Unmatched ] at ' + i }); const j = stack.pop(); jump[i] = j; jump[j] = i; }
  }
  if (stack.length) return postMessage({ error: 'Unmatched [ at ' + stack.pop() });
  while (ip < code.length) {
    if (++steps > 200000000) return postMessage({ output: out, error: 'Stopped after 200 million steps.' });
    switch (code[ip]) {
      case '>': ptr = (ptr + 1) % 30000; break;
      case '<': ptr = (ptr + 29999) % 30000; break;
      case '+': tape[ptr]++; break;
      case '-': tape[ptr]--; break;
      case '.': out += String.fromCharCode(tape[ptr]); break;
      case ',': tape[ptr] = inp < input.length ? input.charCodeAt(inp++) : 0; break;
      case '[': if (!tape[ptr]) ip = jump[ip]; break;
      case ']': if (tape[ptr]) ip = jump[ip]; break;
    }
    ip++;
  }
  postMessage({ output: out });
};`;

export function runBrainfuck(code, input = '', timeoutMs = 10_000) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([BF_WORKER], { type: 'text/javascript' }));
    const worker = new Worker(url);
    const finish = (result) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ output: '', error: `Stopped after ${timeoutMs / 1000} seconds.` }), timeoutMs);
    worker.onmessage = ({ data }) => finish(data);
    worker.postMessage({ code, input });
  });
}

function brainfuckPanel(file) {
  const input = el('input', { placeholder: 'Input (optional)' });
  const output = el('pre', { className: 'bf-output', textContent: 'Press Run to start.' });
  const run = el('button', { type: 'button', textContent: 'Run', onclick: async () => {
    run.disabled = true;
    output.textContent = 'Running…';
    const { output: text, error } = await runBrainfuck(file.content, input.value);
    output.textContent = (text || '') + (error ? `\n[${error}]` : '') || '(no output)';
    run.disabled = false;
  } });
  return el('div', { className: 'bf' }, el('div', { className: 'bf-row' }, input, run), output);
}

// --- Previews ---

// Builds a self-contained page from an HTML file by inlining the project's
// local stylesheets, scripts and SVG images.
function inlineHtml(htmlFile, files) {
  const dir = htmlFile.path.includes('/') ? htmlFile.path.replace(/[^/]*$/, '') : '';
  const find = (ref) => {
    if (!ref || /^(https?:|data:|\/\/)/.test(ref)) return null;
    const parts = [];
    for (const p of (dir + ref.split(/[?#]/)[0]).split('/')) {
      if (p === '..') parts.pop();
      else if (p && p !== '.') parts.push(p);
    }
    return files.find((f) => f.path === parts.join('/'));
  };
  const doc = new DOMParser().parseFromString(htmlFile.content, 'text/html');
  for (const link of doc.querySelectorAll('link[rel~="stylesheet"][href]')) {
    const f = find(link.getAttribute('href'));
    if (f) link.replaceWith(Object.assign(doc.createElement('style'), { textContent: f.content }));
  }
  for (const script of doc.querySelectorAll('script[src]')) {
    const f = find(script.getAttribute('src'));
    if (!f) continue;
    const inline = doc.createElement('script');
    if (script.type) inline.type = script.type;
    inline.textContent = f.content;
    script.replaceWith(inline);
  }
  for (const img of doc.querySelectorAll('img[src]')) {
    const f = find(img.getAttribute('src'));
    if (f && ext(f.path) === 'svg') img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(f.content)}`;
  }
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

// Runs generated pages in a sandbox with no access to Raken or your account.
function htmlFrame(html) {
  const frame = el('iframe', { className: 'preview-frame', srcdoc: html, title: 'Preview' });
  frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-pointer-lock');
  frame.setAttribute('allowfullscreen', '');
  return frame;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function csvTable(text) {
  const [head = [], ...rows] = parseCsv(text);
  return el('div', { className: 'table-wrap' }, el('table', {},
    el('thead', {}, el('tr', {}, ...head.map((h) => el('th', { textContent: h })))),
    el('tbody', {}, ...rows.map((r) => el('tr', {}, ...r.map((c) => el('td', { textContent: c })))))));
}

function svgImage(content, alt) {
  const url = URL.createObjectURL(new Blob([content], { type: 'image/svg+xml' }));
  // Shown through <img>, so any script inside the SVG never runs.
  return el('img', { src: url, alt, className: 'preview-img' });
}

function previewFor(file, files) {
  switch (ext(file.path)) {
    case 'html':
    case 'htm': return htmlFrame(inlineHtml(file, files));
    case 'svg': return svgImage(file.content, file.path);
    case 'md': {
      const div = el('div', { className: 'doc' });
      div.innerHTML = renderMarkdown(file.content);
      return div;
    }
    case 'csv': return csvTable(file.content);
    case 'bf':
    case 'b': return brainfuckPanel(file);
    default: return null;
  }
}

const PREVIEWABLE = new Set(['html', 'htm', 'svg', 'md', 'csv', 'bf', 'b']);

// The file panel under an agent reply: tabs for the preview and each file.
export function filesPanel(files) {
  const main = files.find((f) => /(^|\/)index\.html?$/i.test(f.path))
    ?? files.find((f) => PREVIEWABLE.has(ext(f.path)));
  const body = el('div', { className: 'files-body' });
  const tabs = el('div', { className: 'files-tabs', role: 'tablist' });
  const select = (button, render) => {
    for (const t of tabs.children) t.classList.toggle('active', t === button);
    body.replaceChildren(render());
  };
  const tab = (label, render) => {
    const button = el('button', { type: 'button', className: 'tab', textContent: label, onclick: () => select(button, render) });
    tabs.append(button);
    return button;
  };

  const previewTab = main && tab(ext(main.path) === 'bf' ? 'Run' : 'Preview', () => previewFor(main, files));
  for (const file of files) {
    tab(file.path, () => el('pre', { className: 'source' }, el('code', { textContent: file.content })));
  }

  const actions = el('div', { className: 'files-actions' },
    el('span', { className: 'muted', textContent: `${files.length} file${files.length === 1 ? '' : 's'}` }),
    el('button', { type: 'button', className: 'small ghost', textContent: 'Download all (.zip)', onclick: () => saveFile('raken-project.zip', zip(files)) }),
    el('button', { type: 'button', className: 'small ghost', textContent: 'Download file', onclick: () => {
      const active = [...tabs.children].findIndex((t) => t.classList.contains('active'));
      const file = files[active - (previewTab ? 1 : 0)] ?? main ?? files[0];
      saveFile(baseName(file.path), new Blob([file.content], { type: mimeOf(file.path) }));
    } }),
  );
  const fullscreen = el('button', { type: 'button', className: 'small ghost', textContent: 'Full screen', onclick: () => body.querySelector('iframe, img')?.requestFullscreen?.() });
  actions.append(fullscreen);

  (previewTab ?? tabs.firstChild).click();
  return el('div', { className: 'files' }, tabs, body, actions);
}

// A Vidful movie: the animated SVG plays like a video.
export function moviePanel(file, title) {
  const img = svgImage(file.content, title);
  img.className = 'movie';
  return el('div', { className: 'movie-wrap' }, img, el('div', { className: 'files-actions' },
    el('button', { type: 'button', className: 'small ghost', textContent: 'Replay', onclick: () => { const src = img.src; img.src = ''; img.src = src; } }),
    el('button', { type: 'button', className: 'small ghost', textContent: 'Full screen', onclick: () => img.requestFullscreen?.() }),
    el('button', { type: 'button', className: 'small ghost', textContent: 'Download (.svg)', onclick: () => saveFile(baseName(file.path), new Blob([file.content], { type: 'image/svg+xml' })) }),
  ));
}
