import { renderMarkdown } from './markdown.js';
import { el, filesPanel, moviePanel } from './files.js';
import { isUpgrade, packCard, planCard, planFor } from './plans.js';

const $ = (id) => document.getElementById(id);
const state = { catalog: null, me: null, tool: 'chat', models: {}, conversationId: null, busy: false };

const WELCOME = {
  chat: {
    title: 'How can I help you today?',
    text: 'Ask anything, write and edit text, plan, learn or brainstorm.',
    examples: ['Explain how vaccines work in simple terms', 'Write a polite email asking for a deadline extension', 'Give me 5 dinner ideas with chicken and rice'],
  },
  code: {
    title: 'What should we build?',
    text: 'Raken Code writes complete projects in any language, from Python to Brainfuck. Web apps get a live preview.',
    examples: ['Make a snake game in one HTML file', 'Write a Python script that renames photos by date', 'Write Hello World in Brainfuck'],
  },
  work: {
    title: 'What do you need done?',
    text: 'Raken Work makes documents, reports, slide decks, spreadsheets and emails.',
    examples: ['Make a 6-slide pitch deck for a dog-walking business', 'Create a monthly budget spreadsheet for a family of four', 'Write a one-page project plan for launching a website'],
  },
  vidful: {
    title: 'What is your movie about?',
    text: 'Describe a scene and Raken 1 Vidful makes a short animated movie.',
    examples: ['A paper boat sails through a rainy city at night', 'A rocket launches at sunrise and flies into space', 'A fox walks through a snowy forest'],
  },
};
const PLACEHOLDER = { chat: 'Message Raken', code: 'Describe what to build or change', work: 'Describe the document, deck or sheet you need', vidful: 'Describe your movie' };

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body && JSON.stringify(body),
  });
  if (res.status === 401) location.href = 'login.html';
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.message ?? data.error), { code: data.error });
  return data;
}

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
const plan = () => state.catalog.plans[state.me.plan];
const modelName = (id) => state.catalog.models[id]?.name ?? id;

function renderAccount() {
  const me = state.me;
  $('open-plans').textContent = me.plan === 'ultra' ? 'Ultra plan · Billing' : `${me.planName} plan · Upgrade`;
  $('usage-percent').textContent = `${me.usedPercent}%`;
  $('meter').firstElementChild.style.width = `${me.usedPercent}%`;
  $('meter').classList.toggle('full', me.usedPercent >= 100);
  const reset = new Date(me.resetsAt);
  $('usage-reset').textContent = `Resets ${reset.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
  $('credits').textContent = me.credits.toLocaleString();
  $('ultra').textContent = me.ultraCredits.toLocaleString();
  $('email').textContent = me.email;
  $('use-ultra').disabled = me.ultraCredits === 0;
  if ($('use-ultra').disabled) $('use-ultra').checked = false;
}

function renderTools() {
  const { tools } = state.catalog;
  $('tools').replaceChildren(...Object.entries(tools).map(([id, tool]) => {
    const locked = !plan().tools.includes(id);
    return el('button', {
      type: 'button',
      className: `nav-item${id === state.tool ? ' active' : ''}`,
      title: tool.description,
      onclick: () => (locked ? openPlans() : selectTool(id)),
    }, el('span', { textContent: tool.name }), locked && el('span', { className: 'lock', textContent: `${state.catalog.plans[planFor(state.catalog, { tool: id })].name}` }));
  }));
}

function renderModels() {
  const ids = state.catalog.toolModels[state.tool];
  $('model').replaceChildren(...ids.map((id) => {
    const locked = !plan().models.includes(id);
    const needs = state.catalog.plans[planFor(state.catalog, { model: id })].name;
    return el('option', { value: id, disabled: locked, selected: id === state.models[state.tool], textContent: `${modelName(id)}${locked ? ` (${needs} plan)` : ''}` });
  }));
  $('model').title = state.catalog.models[state.models[state.tool]]?.description ?? '';
}

function pickModel(tool) {
  const allowed = state.catalog.toolModels[tool].filter((m) => plan().models.includes(m));
  if (!allowed.includes(state.models[tool])) state.models[tool] = allowed[0];
}

function selectTool(id, { keepConversation = false } = {}) {
  state.tool = id;
  pickModel(id);
  renderTools();
  renderModels();
  $('prompt').placeholder = PLACEHOLDER[id];
  if (!keepConversation) newChat();
  $('sidebar').classList.remove('open');
}

async function renderHistory() {
  const list = (await api('GET', '/api/conversations')).filter((c) => c.tool === state.tool);
  $('history-heading').textContent = `Recent in ${state.catalog.tools[state.tool].name}`;
  $('history').replaceChildren(...(list.length
    ? list.map((c) => el('button', {
      type: 'button',
      className: `nav-item${c.id === state.conversationId ? ' active' : ''}`,
      title: c.title,
      onclick: () => openConversation(c.id),
    }, el('span', { textContent: c.title })))
    : [el('div', { className: 'empty-note', textContent: 'Nothing yet.' })]));
}

function showWelcome() {
  const w = WELCOME[state.tool];
  $('thread').replaceChildren(el('div', { className: 'welcome' },
    el('h2', { textContent: w.title }),
    el('p', { textContent: w.text }),
    el('div', { className: 'actions' }, ...w.examples.map((text) => el('button', {
      type: 'button',
      className: 'ghost small',
      textContent: text,
      onclick: () => { $('prompt').value = text; autosize(); $('prompt').focus(); },
    }))),
  ));
}

function newChat() {
  state.conversationId = null;
  $('title').textContent = state.tool === 'chat' ? 'New chat' : `New ${state.catalog.tools[state.tool].name} task`;
  showWelcome();
  renderHistory();
}

async function openConversation(id) {
  const convo = await api('GET', `/api/conversation?id=${encodeURIComponent(id)}`);
  if (convo.tool !== state.tool) selectTool(convo.tool, { keepConversation: true });
  state.conversationId = id;
  $('title').textContent = convo.title;
  $('thread').replaceChildren();
  for (const m of convo.messages) addMessage(m);
  if (!convo.messages.length) showWelcome();
  renderHistory();
  $('sidebar').classList.remove('open');
}

function costLabel(m) {
  const c = m.charged;
  if (!c) return modelName(m.model);
  if (c.ultraCredits) return `${modelName(m.model)} · Ultra priority · ${plural(c.ultraCredits, 'Ultra Credit')}`;
  const credits = c.credits ? ` · ${plural(c.credits, 'Credit')}` : '';
  return `${modelName(m.model)} · ${c.units} usage units${credits}`;
}

function fillAiMessage(node, m) {
  node.replaceChildren();
  const body = el('div');
  body.innerHTML = renderMarkdown(m.text ?? '');
  node.append(body);
  const files = m.files ?? [];
  if (m.preview === 'movie' && files[0]) node.append(moviePanel(files[0], m.text));
  else if (files.length) node.append(filesPanel(files));
  node.append(el('span', { className: 'meta', textContent: costLabel(m) }));
}

function addMessage(m) {
  $('thread').querySelector('.welcome')?.remove();
  const node = el('div', { className: `msg ${m.role}` });
  if (m.role === 'ai') fillAiMessage(node, m);
  else node.textContent = m.text;
  $('thread').append(node);
  node.scrollIntoView({ block: 'end' });
  return node;
}

// Shows an error with the action that fixes it, if there is one.
function showError(node, message, code) {
  node.className = 'msg ai';
  const fix = {
    limit_reached: ['Buy Credits', openPlans],
    no_ultra: ['Buy Ultra Credits', openPlans],
    tool_locked: ['See plans', openPlans],
    model_locked: ['See plans', openPlans],
  }[code];
  node.replaceChildren(el('div', { className: 'notice' },
    el('span', { className: 'error', textContent: message }),
    fix && el('div', { className: 'actions' }, el('button', { type: 'button', className: 'small', textContent: fix[0], onclick: fix[1] })),
  ));
}

// Raken thinks the task is huge: offer Ultra Credits, or run it normally anyway.
function suggestUltra(node, data, job) {
  const has = state.me.ultraCredits > 0;
  node.replaceChildren(el('div', { className: 'notice ultra' },
    el('strong', { textContent: 'This is a big task' }),
    el('span', { textContent: `${data.reason} A skilled person would need ${data.estimate}.` }),
    el('span', { textContent: 'On normal usage it can take a long time and use a lot of your weekly usage. Ultra Credits run it on the priority path in much higher quality and much faster.' }),
    el('div', { className: 'actions' },
      el('button', {
        type: 'button',
        className: 'small',
        textContent: has ? `Use Ultra Credits (you have ${state.me.ultraCredits})` : 'Buy Ultra Credits',
        onclick: () => (has ? send({ ...job, ultra: true, reuse: node }) : openPlans()),
      }),
      el('button', { type: 'button', className: 'small ghost', textContent: 'Run normally anyway', onclick: () => send({ ...job, skipCheck: true, reuse: node }) }),
    ),
  ));
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

async function send({ prompt, ultra = false, skipCheck = false, reuse = null }) {
  if (!prompt || state.busy) return;
  state.busy = true;
  $('send').disabled = true;
  const job = { prompt };
  if (!reuse) addMessage({ role: 'user', text: prompt });
  const reply = reuse ?? addMessage({ role: 'ai', text: '' });
  reply.className = 'msg ai';
  const working = el('span', { className: 'working', textContent: ultra ? 'Starting on the Ultra priority path…' : 'Thinking…' });
  reply.replaceChildren(working);

  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tool: state.tool, modelId: state.models[state.tool], prompt, ultra, skipCheck, conversationId: state.conversationId }),
    });
    if (!res.headers.get('content-type')?.startsWith('text/event-stream')) {
      const data = await res.json();
      throw Object.assign(new Error(data.message ?? data.error), { code: data.error });
    }
    let text = '';
    for await (const { event, data } of events(res)) {
      if (data.account) state.me = { ...state.me, ...data.account };
      if (event === 'start' && !state.conversationId) {
        state.conversationId = data.conversationId;
        $('title').textContent = data.title;
        renderHistory();
      } else if (event === 'status') {
        working.textContent = data.text;
      } else if (event === 'delta') {
        text += data.text;
        reply.innerHTML = renderMarkdown(text);
        reply.scrollIntoView({ block: 'end' });
      } else if (event === 'suggest_ultra') {
        suggestUltra(reply, data, job);
      } else if (event === 'done') {
        fillAiMessage(reply, data.message);
      } else if (event === 'error') {
        throw Object.assign(new Error(data.message), { code: data.code });
      }
    }
  } catch (err) {
    showError(reply, err.message, err.code);
  } finally {
    state.busy = false;
    $('send').disabled = false;
    renderAccount();
  }
}

// --- Plans and billing (demo payments) ---

async function openPlans() {
  const { catalog, me } = state;
  $('plans').replaceChildren(...Object.keys(catalog.plans).map((id) => {
    const current = id === me.plan;
    const label = current ? 'Current plan' : isUpgrade(me.plan, id) ? `Upgrade to ${catalog.plans[id].name}` : `Switch to ${catalog.plans[id].name}`;
    return planCard(catalog, id, {
      current,
      action: { label, disabled: current, ghost: !isUpgrade(me.plan, id), onClick: () => checkout('plan', id) },
    });
  }));
  const packs = (kind) => Object.keys(catalog.packs).filter((id) => catalog.packs[id].kind === kind)
    .map((id) => packCard(catalog, id, { action: { label: 'Buy', onClick: () => checkout('pack', id) } }));
  $('credit-packs').replaceChildren(...packs('credits'));
  $('ultra-packs').replaceChildren(...packs('ultraCredits'));
  if (!$('plans-dialog').open) $('plans-dialog').showModal();
  $('sidebar').classList.remove('open');
  const orders = await api('GET', '/api/billing/history');
  $('orders').replaceChildren(...(orders.length
    ? orders.map((o) => el('div', { className: 'row' },
      el('span', { textContent: `${new Date(o.at).toLocaleDateString()} · ${o.item}` }),
      el('span', { className: 'muted', textContent: `$${o.priceUsd}${o.period ? '/mo' : ''} (demo)` })))
    : [el('span', { className: 'muted', textContent: 'No purchases yet.' })]));
}

function checkout(kind, id) {
  const { catalog } = state;
  const item = kind === 'plan'
    ? { label: `Raken ${catalog.plans[id].name} plan`, price: `$${catalog.plans[id].priceUsd}.00 / month` }
    : { label: `${catalog.packs[id].amount.toLocaleString()} ${catalog.packs[id].kind === 'credits' ? 'Credits' : 'Ultra Credits'}`, price: `$${catalog.packs[id].priceUsd}.00` };
  $('checkout-item').textContent = item.label;
  $('checkout-price').textContent = item.price;
  $('checkout-error').textContent = '';
  $('checkout-confirm').textContent = 'Confirm (demo)';
  $('checkout-confirm').onclick = async () => {
    $('checkout-confirm').disabled = true;
    try {
      const res = kind === 'plan'
        ? await api('POST', '/api/billing/subscribe', { plan: id })
        : await api('POST', '/api/billing/buy', { pack: id });
      state.me = { ...state.me, ...res.account };
      $('checkout-dialog').close();
      renderAccount();
      selectTool(plan().tools.includes(state.tool) ? state.tool : 'chat', { keepConversation: true });
      await openPlans();
    } catch (err) {
      $('checkout-error').textContent = err.message;
    } finally {
      $('checkout-confirm').disabled = false;
    }
  };
  $('checkout-dialog').showModal();
}

function autosize() {
  const t = $('prompt');
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight}px`;
}

async function init() {
  [state.catalog, state.me] = await Promise.all([api('GET', '/api/catalog'), api('GET', '/api/me')]);
  $('composer').addEventListener('submit', (e) => {
    e.preventDefault();
    const prompt = $('prompt').value.trim();
    if (!prompt || state.busy) return;
    $('prompt').value = '';
    autosize();
    send({ prompt, ultra: $('use-ultra').checked });
  });
  $('prompt').addEventListener('input', autosize);
  $('prompt').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || matchMedia('(pointer: coarse)').matches) return;
    e.preventDefault();
    $('composer').requestSubmit();
  });
  $('model').addEventListener('change', () => {
    state.models[state.tool] = $('model').value;
    renderModels();
  });
  $('open-plans').addEventListener('click', openPlans);
  $('checkout-cancel').addEventListener('click', () => $('checkout-dialog').close());
  $('new-chat').addEventListener('click', newChat);
  $('menu').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('logout').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('POST', '/api/logout');
    location.href = 'login.html';
  });
  renderAccount();
  selectTool('chat');
}

init();
