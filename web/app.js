import { renderMarkdown } from './markdown.js';
import { meshPreview } from './mesh.js';
import { planCard } from './plans.js';

const $ = (id) => document.getElementById(id);
const state = { catalog: null, me: null, tool: 'chat', modelId: 'raken-standard', conversationId: null, busy: false };

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body && JSON.stringify(body),
  });
  if (res.status === 401) location.href = 'login.html';
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? data.error);
  return data;
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
const plan = () => state.catalog.plans[state.me.plan];

function renderAccount() {
  $('plan-name').textContent = state.me.planName;
  $('credits').textContent = state.me.credits.toLocaleString();
  $('ultra').textContent = state.me.ultraCredits.toLocaleString();
  $('email').textContent = state.me.email;
  $('use-ultra').disabled = state.me.ultraCredits === 0;
  if ($('use-ultra').disabled) $('use-ultra').checked = false;
}

function optionButton({ active, locked, label, description, onSelect }) {
  return el('button', {
    type: 'button',
    className: `option${active ? ' active' : ''}${locked ? ' locked' : ''}`,
    title: locked ? 'Upgrade to unlock' : '',
    onclick: () => (locked ? openPlans() : onSelect()),
  }, `${locked ? '🔒 ' : ''}${label}`, el('small', {}, description));
}

function renderPickers() {
  const { tools, models, toolModels } = state.catalog;
  $('tools').replaceChildren(...Object.entries(tools).map(([id, tool]) => optionButton({
    active: id === state.tool,
    locked: !plan().tools.includes(id),
    label: tool.name,
    description: tool.description,
    onSelect: () => selectTool(id),
  })));
  $('models').replaceChildren(...toolModels[state.tool].map((id) => optionButton({
    active: id === state.modelId,
    locked: !plan().models.includes(id),
    label: models[id].name,
    description: models[id].description,
    onSelect: () => selectModel(id),
  })));
  $('model-label').textContent = `${tools[state.tool].name} · ${models[state.modelId]?.name ?? ''}`;
  const placeholders = { chat: 'Message Raken…', work: 'Describe the files you want…', vidful: 'Describe your short movie…' };
  $('prompt').placeholder = placeholders[state.tool];
}

function selectTool(id) {
  state.tool = id;
  const allowed = state.catalog.toolModels[id].filter((m) => plan().models.includes(m));
  if (!allowed.includes(state.modelId)) state.modelId = allowed[0];
  renderPickers();
  updateQuote();
}

function selectModel(id) {
  state.modelId = id;
  renderPickers();
  updateQuote();
}

async function renderHistory() {
  const list = await api('GET', '/api/conversations');
  $('history').replaceChildren(...list.map((c) => el('button', {
    type: 'button',
    className: c.id === state.conversationId ? 'active' : '',
    textContent: c.title,
    title: c.title,
    onclick: () => openConversation(c.id),
  })));
}

function showEmpty() {
  $('messages').replaceChildren(el('div', { className: 'empty' },
    el('h2', {}, 'What can Raken do for you?'),
    el('p', {}, 'Chat with Raken, ask Work agents to make files, or make images, short movies and 3D models.'),
  ));
}

function newChat() {
  state.conversationId = null;
  $('title').textContent = 'New chat';
  showEmpty();
  renderHistory();
}

async function openConversation(id) {
  const convo = await api('GET', `/api/conversation?id=${encodeURIComponent(id)}`);
  state.conversationId = id;
  $('title').textContent = convo.title;
  $('messages').replaceChildren();
  for (const m of convo.messages) addMessage(m);
  if (!convo.messages.length) showEmpty();
  renderHistory();
  $('sidebar').classList.remove('open');
}

function fileUrl(file) {
  const type = file.name.endsWith('.svg') ? 'image/svg+xml' : 'text/plain';
  return URL.createObjectURL(new Blob([file.content], { type }));
}

function costLabel(m) {
  const model = state.catalog.models[m.model]?.name ?? m.model;
  const cost = m.charged.ultraCredits ? `${m.charged.ultraCredits} Ultra (fast)` : plural(m.charged.credits, 'credit');
  return `${model} · ${cost}`;
}

function fillAiMessage(node, m) {
  node.replaceChildren();
  const body = el('div');
  body.innerHTML = renderMarkdown(m.text ?? '');
  node.append(body);

  const files = m.files ?? [];
  if (m.preview?.type === 'mesh' && files[0]) node.append(meshPreview(files[0].content));
  else if (m.preview && files[0]) {
    // Shown through <img>, so any script inside the SVG never runs.
    node.append(el('img', { src: fileUrl(files[0]), alt: m.text }));
  }
  if (files.length) {
    node.append(el('div', { className: 'files' },
      ...files.map((f) => el('a', { href: fileUrl(f), download: f.name, textContent: `⬇ ${f.name}` }))));
  }
  if (m.charged) node.append(el('span', { className: 'meta', textContent: costLabel(m) }));
}

function addMessage(m) {
  $('messages').querySelector('.empty')?.remove();
  const node = el('div', { className: `msg ${m.role}` });
  if (m.role === 'ai') fillAiMessage(node, m);
  else node.textContent = m.text;
  $('messages').append(node);
  node.scrollIntoView({ block: 'end' });
  return node;
}

let quoteTimer;
function updateQuote() {
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(async () => {
    const prompt = $('prompt').value;
    if (!prompt.trim() || !state.modelId) return void ($('quote').textContent = '');
    const q = await api('POST', '/api/quote', { modelId: state.modelId, prompt });
    $('quote').textContent = $('use-ultra').checked
      ? `Costs ${plural(q.ultraCredits, 'Ultra Credit')}`
      : `Costs ${plural(q.credits, 'credit')}`;
  }, 200);
}

// Reads the server-sent events stream from POST /api/run.
async function* events(res) {
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let split;
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const event = chunk.match(/^event: (.*)$/m)?.[1];
      const data = chunk.match(/^data: (.*)$/m)?.[1];
      if (event && data) yield { event, data: JSON.parse(data) };
    }
  }
}

async function send(e) {
  e.preventDefault();
  const prompt = $('prompt').value.trim();
  if (!prompt || state.busy) return;
  state.busy = true;
  $('send').disabled = true;
  const ultra = $('use-ultra').checked;
  addMessage({ role: 'user', text: prompt });
  $('prompt').value = '';
  $('quote').textContent = '';
  const reply = addMessage({ role: 'ai', text: '' });
  reply.append(el('span', { className: 'working', textContent: 'Raken is thinking…' }));

  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tool: state.tool, modelId: state.modelId, prompt, ultra, conversationId: state.conversationId }),
    });
    if (!res.headers.get('content-type')?.startsWith('text/event-stream')) {
      const data = await res.json();
      throw new Error(data.message ?? data.error);
    }
    let text = '';
    for await (const { event, data } of events(res)) {
      if (event === 'start') {
        state.me = data.account;
        renderAccount();
        if (!state.conversationId) {
          state.conversationId = data.conversationId;
          $('title').textContent = data.title;
          renderHistory();
        }
      } else if (event === 'status') {
        reply.querySelector('.working').textContent = data.text;
      } else if (event === 'delta') {
        text += data.text;
        reply.innerHTML = renderMarkdown(text);
        reply.scrollIntoView({ block: 'end' });
      } else if (event === 'done') {
        fillAiMessage(reply, data.message);
        state.me = data.account;
      } else if (event === 'error') {
        state.me = data.account;
        throw new Error(data.message);
      }
    }
  } catch (err) {
    reply.className = 'msg error';
    reply.textContent = err.message;
  } finally {
    state.busy = false;
    $('send').disabled = false;
    renderAccount();
  }
}

function openPlans() {
  const billing = state.catalog.billing;
  $('plans-error').textContent = '';
  $('billing-note').textContent = billing
    ? 'Paid plans renew monthly. Cancel any time from Manage billing.'
    : 'Payments are not set up on this server yet.';
  $('manage-billing').hidden = !state.me.hasSubscription;
  $('plans').replaceChildren(...Object.entries(state.catalog.plans).map(([id, p]) => {
    const current = id === state.me.plan;
    let action;
    if (current) action = { label: 'Current plan', disabled: true };
    else if (id === 'free') action = state.me.hasSubscription ? { label: 'Cancel in billing', onClick: manageBilling } : null;
    else if (state.me.hasSubscription) action = { label: `Switch in billing`, onClick: manageBilling };
    else action = { label: `Upgrade to ${p.name}`, disabled: !billing, onClick: () => checkout(id) };
    return planCard(state.catalog, id, p, { current, action });
  }));
  $('plans-dialog').showModal();
}

async function checkout(planId) {
  try {
    location.href = (await api('POST', '/api/billing/checkout', { plan: planId })).url;
  } catch (err) {
    $('plans-error').textContent = err.message;
  }
}

async function manageBilling() {
  try {
    location.href = (await api('POST', '/api/billing/portal')).url;
  } catch (err) {
    $('plans-error').textContent = err.message;
  }
}

async function init() {
  [state.catalog, state.me] = await Promise.all([api('GET', '/api/catalog'), api('GET', '/api/me')]);
  $('composer').addEventListener('submit', send);
  $('prompt').addEventListener('input', updateQuote);
  $('prompt').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    $('composer').requestSubmit();
  });
  $('use-ultra').addEventListener('change', updateQuote);
  $('open-plans').addEventListener('click', openPlans);
  $('manage-billing').addEventListener('click', manageBilling);
  $('new-chat').addEventListener('click', newChat);
  $('menu').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('logout').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('POST', '/api/logout');
    location.href = '/';
  });
  selectTool('chat');
  renderAccount();
  newChat();
  if (new URLSearchParams(location.search).has('upgraded')) {
    history.replaceState(null, '', 'app.html');
    addMessage({ role: 'ai', text: 'Thanks for upgrading! Your new plan unlocks as soon as the payment is confirmed.' });
    // Stripe confirms the payment by webhook, usually within a few seconds.
    for (let i = 0; i < 10 && !state.me.hasSubscription; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      state.me = await api('GET', '/api/me');
    }
    renderAccount();
    selectTool(state.tool);
  }
}

init();
