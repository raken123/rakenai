const $ = (id) => document.getElementById(id);

const state = { token: null, account: null, catalog: null, tool: 'chat', modelId: 'raken-standard' };

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...(state.token && { authorization: `Bearer ${state.token}` }) },
    body: body && JSON.stringify(body),
  });
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

function plan() {
  return state.catalog.plans[state.account.plan];
}

function renderAccount() {
  $('plan-name').textContent = state.account.planName;
  $('credits').textContent = state.account.credits.toLocaleString();
  $('ultra').textContent = state.account.ultraCredits.toLocaleString();
  $('use-ultra').disabled = state.account.ultraCredits === 0;
  if ($('use-ultra').disabled) $('use-ultra').checked = false;
}

function renderSidebar() {
  const { tools, models, toolModels } = state.catalog;
  const p = plan();

  $('tools').replaceChildren(
    ...Object.entries(tools).map(([id, tool]) => {
      const locked = !p.tools.includes(id);
      return el('button', {
        className: `option${id === state.tool ? ' active' : ''}${locked ? ' locked' : ''}`,
        title: locked ? 'Upgrade to unlock' : '',
        onclick: () => (locked ? $('plans-dialog').showModal() : selectTool(id)),
      }, `${locked ? '🔒 ' : ''}${tool.name}`, el('small', {}, tool.description));
    }),
  );

  $('models').replaceChildren(
    ...toolModels[state.tool].map((id) => {
      const model = models[id];
      const locked = !p.models.includes(id);
      return el('button', {
        className: `option${id === state.modelId ? ' active' : ''}${locked ? ' locked' : ''}`,
        title: locked ? 'Upgrade to unlock' : '',
        onclick: () => (locked ? $('plans-dialog').showModal() : selectModel(id)),
      }, `${locked ? '🔒 ' : ''}${model.name}`, el('small', {}, model.description));
    }),
  );
}

function renderPlans() {
  const { plans, models, tools } = state.catalog;
  $('plans').replaceChildren(
    ...Object.entries(plans).map(([id, p]) => {
      const current = id === state.account.plan;
      const allowance = p.dailyCredits
        ? `${p.dailyCredits} credits every day you log in`
        : `${p.monthlyCredits.toLocaleString()} credits / month`;
      return el('div', { className: `plan${current ? ' current' : ''}` },
        el('h3', {}, p.name),
        el('div', { className: 'price' }, p.priceUsd ? `$${p.priceUsd}/mo` : 'Free'),
        el('ul', {},
          el('li', {}, allowance),
          el('li', {}, `${p.monthlyUltraCredits} Ultra Credits / month`),
          el('li', {}, `Models: ${p.models.map((m) => models[m].name).join(', ')}`),
          el('li', {}, `Tools: ${p.tools.map((t) => tools[t].name).join(', ')}`),
        ),
        el('button', { disabled: current, onclick: () => switchPlan(id) }, current ? 'Current plan' : `Switch to ${p.name}`),
      );
    }),
  );
}

function selectTool(id) {
  state.tool = id;
  const allowed = state.catalog.toolModels[id].filter((m) => plan().models.includes(m));
  if (!allowed.includes(state.modelId)) state.modelId = allowed[0];
  renderSidebar();
  updateQuote();
}

function selectModel(id) {
  state.modelId = id;
  renderSidebar();
  updateQuote();
}

async function switchPlan(id) {
  state.account = await api('POST', '/api/plan', { plan: id });
  if (!plan().tools.includes(state.tool)) state.tool = 'chat';
  selectTool(state.tool);
  renderAccount();
  renderPlans();
}

let quoteTimer;
function updateQuote() {
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(async () => {
    const prompt = $('prompt').value;
    if (!prompt.trim() || !state.modelId) return ($('quote').textContent = '');
    const q = await api('POST', '/api/quote', { modelId: state.modelId, prompt });
    $('quote').textContent = $('use-ultra').checked ? `Costs ${q.ultraCredits} Ultra` : `Costs ${plural(q.credits, 'credit')}`;
  }, 200);
}

function addMessage(kind, text, meta, file) {
  $('messages').querySelector('.empty')?.remove();
  const link = file && el('a', {
    href: URL.createObjectURL(new Blob([file.content], { type: 'text/markdown' })),
    download: file.name,
  }, `Download ${file.name}`);
  const msg = el('div', { className: `msg ${kind}` }, text, link && el('br'), link, meta && el('span', { className: 'meta' }, meta));
  $('messages').append(msg);
  msg.scrollIntoView({ behavior: 'smooth' });
}

async function send(event) {
  event.preventDefault();
  const prompt = $('prompt').value.trim();
  if (!prompt || !state.modelId) return;
  const ultra = $('use-ultra').checked;
  addMessage('user', prompt);
  $('prompt').value = '';
  $('quote').textContent = '';
  try {
    const out = await api('POST', '/api/run', { tool: state.tool, modelId: state.modelId, prompt, ultra });
    state.account = out.account;
    const cost = out.charged.ultraCredits ? `${out.charged.ultraCredits} Ultra` : plural(out.charged.credits, 'credit');
    addMessage('ai', out.text, `${state.catalog.models[state.modelId].name} · ${cost}`, out.file);
    renderAccount();
  } catch (err) {
    addMessage('error', err.message);
  }
}

async function init() {
  state.catalog = await api('GET', '/api/catalog');
  state.token = localStorage.getItem('raken-token');
  try {
    state.account = await api('GET', '/api/me');
  } catch {
    const login = await api('POST', '/api/login');
    state.token = login.token;
    state.account = login.account;
    localStorage.setItem('raken-token', login.token);
  }
  $('composer').addEventListener('submit', send);
  $('prompt').addEventListener('input', updateQuote);
  $('prompt').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    $('composer').requestSubmit();
  });
  $('use-ultra').addEventListener('change', updateQuote);
  $('open-plans').addEventListener('click', () => $('plans-dialog').showModal());
  selectTool('chat');
  renderAccount();
  renderPlans();
}

init();
