import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MODELS, PACKS, PLANS, TOOLS, TOOL_MODELS, weeklyUnits } from './src/catalog.js';
import { RakenError, authorize, newAccount, settle, usageSummary } from './src/usage.js';
import { openDb } from './src/db.js';
import { createAuth, SESSION_COOKIE, SESSION_MAX_AGE } from './src/auth.js';
import { createBilling } from './src/billing.js';
import * as ai from './src/ai.js';

const WEB_ROOT = join(import.meta.dirname, 'web');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};
const ERROR_STATUS = {
  unauthorized: 401,
  bad_login: 401,
  limit_reached: 402,
  no_ultra: 402,
  tool_locked: 403,
  model_locked: 403,
  not_found: 404,
  email_taken: 409,
  same_plan: 409,
  busy: 429,
  ai_not_configured: 503,
  ai_error: 502,
};
// Code and Work suggest Ultra Credits for tasks this big.
const ULTRA_SIZES = new Set(['huge']);

export function createApp({ db = openDb() } = {}) {
  const auth = createAuth(db);
  const billing = createBilling(db);
  const { data } = db;
  const running = new Set();

  function sendJson(res, status, body, headers = {}) {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  }

  async function readJson(req, limit = 200_000) {
    if (!req.headers['content-type']?.startsWith('application/json')) {
      throw new RakenError('bad_request', 'Expected a JSON body.');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw new RakenError('too_large', 'That message is too long.');
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks);
    return raw.length ? JSON.parse(raw) : {};
  }

  function cookieToken(req) {
    const match = req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    return match?.[1];
  }

  function sessionCookie(req, token, maxAge = SESSION_MAX_AGE) {
    const secure = process.env.PUBLIC_URL?.startsWith('https:') || req.headers['x-forwarded-proto'] === 'https';
    return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  }

  function currentUser(req) {
    const user = auth.userForToken(cookieToken(req));
    if (!user) throw new RakenError('unauthorized', 'Log in first.');
    // Accounts from the earlier credit system start fresh on the matching plan.
    if (user.account.usedTokens === undefined) {
      user.account = newAccount(PLANS[user.account.plan] ? user.account.plan : 'free');
      db.save();
    }
    return user;
  }

  function me(user) {
    return { email: user.email, ...usageSummary(user.account) };
  }

  function conversation(user, id) {
    const convo = data.conversations[id];
    if (!convo || convo.userId !== user.id) throw new RakenError('not_found', 'Conversation not found.');
    return convo;
  }

  function slug(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'raken';
  }

  // Keeps agent file paths relative and inside the project.
  function cleanPath(path) {
    const parts = String(path).replace(/\\/g, '/').split('/').filter((p) => p && p !== '.' && p !== '..');
    return parts.join('/') || 'file.txt';
  }

  function sse(res) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    return (event, payload) => res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  async function runChat(convo, { modelId, ultra, prompt }, send) {
    convo.history.push({ role: 'user', content: prompt });
    try {
      const result = await ai.chat({ modelId, ultra, history: convo.history, onText: (text) => send('delta', { text }) });
      convo.history.push({ role: 'assistant', content: result.content });
      return { reply: { text: result.text }, usage: result.usage };
    } catch (err) {
      convo.history.pop();
      throw err;
    }
  }

  async function runAgent(convo, { tool, modelId, ultra, prompt }, send) {
    send('status', { text: ultra ? 'Working on the Ultra priority path…' : `${MODELS[modelId].name} is working…` });
    const turns = convo.display
      .filter((m) => m.role === 'ai' && m.prompt)
      .map((m) => ({ prompt: m.prompt, reply: m.text }));
    const { output, usage } = await ai.agent({
      tool,
      modelId,
      ultra,
      turns,
      files: convo.files ?? [],
      prompt,
      onProgress: (text) => send('status', { text }),
    });

    if (tool === 'vidful') {
      const files = [{ path: `${slug(output.title)}.svg`, content: output.svg }];
      convo.files = files;
      return { reply: { text: output.title, files, preview: 'movie' }, usage };
    }
    const files = output.files.map((f) => ({ path: cleanPath(f.path), content: f.content }));
    convo.files = files;
    return { reply: { text: output.summary, files }, usage };
  }

  async function run(req, res) {
    const user = currentUser(req);
    const body = await readJson(req, 2_000_000);
    const { tool, modelId, prompt, conversationId, skipCheck = false } = body;
    const ultra = Boolean(body.ultra);
    if (typeof prompt !== 'string' || !prompt.trim()) throw new RakenError('empty_prompt', 'Write a message first.');

    let convo = conversationId ? conversation(user, conversationId) : null;
    if (convo && convo.tool !== tool) throw new RakenError('bad_tool', `This conversation belongs to ${TOOLS[convo.tool].name}.`);
    if (convo && running.has(convo.id)) throw new RakenError('busy', 'Raken is still working in this conversation.');
    authorize(user.account, { tool, modelId, ultra });

    const send = sse(res);
    if (convo) running.add(convo.id);
    try {
      // Big Code and Work tasks: suggest Ultra Credits before spending anything.
      if ((tool === 'code' || tool === 'work') && !ultra && !skipCheck) {
        send('status', { text: 'Sizing up the task…' });
        const size = await ai.assess(prompt);
        if (size && ULTRA_SIZES.has(size.size)) {
          send('suggest_ultra', { estimate: size.estimate, reason: size.reason, account: me(user) });
          return;
        }
      }

      if (!convo) {
        const id = randomUUID();
        convo = data.conversations[id] = {
          id,
          userId: user.id,
          tool,
          title: prompt.trim().slice(0, 60),
          createdAt: new Date().toISOString(),
          history: [],
          display: [],
        };
        running.add(id);
      }
      send('start', { conversationId: convo.id, title: convo.title, account: me(user) });

      const job = { tool, modelId, ultra, prompt };
      const { reply, usage } = tool === 'chat' ? await runChat(convo, job, send) : await runAgent(convo, job, send);
      const charged = settle(user.account, { modelId, ultra, ...usage });
      const userTurn = { role: 'user', text: prompt };
      const aiTurn = { role: 'ai', ...reply, prompt, model: modelId, charged, ultra };
      convo.display.push(userTurn, aiTurn);
      convo.updatedAt = new Date().toISOString();
      send('done', { message: aiTurn, account: me(user) });
    } catch (err) {
      const known = err instanceof RakenError;
      if (!known) console.error(err);
      send('error', { message: known ? err.message : 'Something went wrong. You were not charged.', code: known ? err.code : 'server_error', account: me(user) });
    } finally {
      if (convo) running.delete(convo.id);
      db.save();
      res.end();
    }
  }

  const routes = {
    'GET /api/catalog': () => ({
      models: MODELS,
      tools: TOOLS,
      toolModels: TOOL_MODELS,
      plans: Object.fromEntries(Object.entries(PLANS).map(([id, p]) => [id, { ...p, weeklyUnits: weeklyUnits(id) }])),
      packs: PACKS,
      demoPayments: true,
    }),

    'POST /api/signup': async (req, res) => {
      const { email, password } = await readJson(req);
      const { user, token } = await auth.signup(email, password);
      sendJson(res, 200, me(user), { 'set-cookie': sessionCookie(req, token) });
    },

    'POST /api/login': async (req, res) => {
      const { email, password } = await readJson(req);
      const { user, token } = await auth.login(email, password);
      sendJson(res, 200, me(user), { 'set-cookie': sessionCookie(req, token) });
    },

    'POST /api/logout': (req, res) => {
      auth.logout(cookieToken(req));
      sendJson(res, 200, { ok: true }, { 'set-cookie': sessionCookie(req, '', 0) });
    },

    'GET /api/me': (req) => me(currentUser(req)),

    'GET /api/conversations': (req) => {
      const user = currentUser(req);
      return Object.values(data.conversations)
        .filter((c) => c.userId === user.id)
        .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
        .map(({ id, title, tool = 'chat', updatedAt, createdAt }) => ({ id, title, tool, updatedAt: updatedAt ?? createdAt }));
    },

    'GET /api/conversation': (req) => {
      const id = new URL(req.url, 'http://x').searchParams.get('id');
      const { title, tool = 'chat', display } = conversation(currentUser(req), id);
      return { id, title, tool, messages: display };
    },

    'POST /api/conversation/delete': async (req) => {
      const { id } = await readJson(req);
      conversation(currentUser(req), id);
      delete data.conversations[id];
      db.save();
      return { ok: true };
    },

    'POST /api/run': run,

    'GET /api/billing/history': (req) => currentUser(req).orders ?? [],

    'POST /api/billing/subscribe': async (req) => {
      const user = currentUser(req);
      const { plan } = await readJson(req);
      return { order: billing.subscribe(user, plan), account: me(user) };
    },

    'POST /api/billing/buy': async (req) => {
      const user = currentUser(req);
      const { pack } = await readJson(req);
      return { order: billing.buyPack(user, pack), account: me(user) };
    },
  };

  async function serveStatic(req, res) {
    const path = new URL(req.url, 'http://x').pathname;
    const file = join(WEB_ROOT, path === '/' ? 'index.html' : path);
    if (!file.startsWith(WEB_ROOT + '/') || req.method !== 'GET') return sendJson(res, 404, { error: 'not_found' });
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        'x-content-type-options': 'nosniff',
      });
      res.end(body);
    } catch {
      sendJson(res, 404, { error: 'not_found' });
    }
  }

  return createServer(async (req, res) => {
    const route = routes[`${req.method} ${new URL(req.url, 'http://x').pathname}`];
    if (!route) return serveStatic(req, res);
    try {
      const result = await route(req, res);
      if (!res.headersSent) sendJson(res, 200, result);
    } catch (err) {
      if (res.headersSent) return res.end();
      if (err instanceof RakenError) {
        return sendJson(res, ERROR_STATUS[err.code] ?? 400, { error: err.code, message: err.message });
      }
      if (err instanceof SyntaxError) return sendJson(res, 400, { error: 'bad_json', message: 'Invalid JSON body.' });
      console.error(err);
      sendJson(res, 500, { error: 'server_error', message: 'Something went wrong.' });
    }
  });
}

if (process.argv[1] === import.meta.filename) {
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, () => console.log(`Raken running at http://localhost:${port}`));
}
