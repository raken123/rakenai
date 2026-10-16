import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MODELS, PLANS, TOOLS, TOOL_MODELS } from './src/catalog.js';
import { RakenError, charge, creditCost, refreshAllowance, refund, ultraCost } from './src/credits.js';
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
};
const ERROR_STATUS = {
  unauthorized: 401,
  bad_login: 401,
  no_credits: 402,
  no_ultra: 402,
  tool_locked: 403,
  model_locked: 403,
  not_found: 404,
  email_taken: 409,
  busy: 429,
  ai_not_configured: 503,
  billing_not_configured: 503,
  ai_error: 502,
};

export function createApp({ db = openDb(), env = process.env } = {}) {
  const auth = createAuth(db);
  const billing = createBilling(db, env);
  const { data } = db;
  const running = new Set();

  function sendJson(res, status, body, headers = {}) {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  }

  async function readBody(req, limit = 200_000) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw new RakenError('too_large', 'That message is too long.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async function readJson(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) {
      throw new RakenError('bad_request', 'Expected a JSON body.');
    }
    const raw = await readBody(req);
    return raw.length ? JSON.parse(raw) : {};
  }

  function cookieToken(req) {
    const match = req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    return match?.[1];
  }

  function sessionCookie(req, token, maxAge = SESSION_MAX_AGE) {
    const secure = env.PUBLIC_URL?.startsWith('https:') || req.headers['x-forwarded-proto'] === 'https';
    return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  }

  function currentUser(req) {
    const user = auth.userForToken(cookieToken(req));
    if (!user) throw new RakenError('unauthorized', 'Log in first.');
    refreshAllowance(user.account);
    return user;
  }

  function origin(req) {
    if (env.PUBLIC_URL) return env.PUBLIC_URL.replace(/\/$/, '');
    const proto = req.headers['x-forwarded-proto'] ?? 'http';
    return `${proto}://${req.headers.host}`;
  }

  function me(user) {
    const { plan, credits, ultraCredits } = user.account;
    return {
      email: user.email,
      plan,
      planName: PLANS[plan].name,
      credits,
      ultraCredits,
      hasSubscription: Boolean(user.subscriptionId),
    };
  }

  function conversation(user, id) {
    const convo = data.conversations[id];
    if (!convo || convo.userId !== user.id) throw new RakenError('not_found', 'Conversation not found.');
    return convo;
  }

  function slug(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'raken';
  }

  function sse(res) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    return (event, payload) => res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  async function run(req, res) {
    const user = currentUser(req);
    const { tool, modelId, prompt, ultra = false, conversationId } = await readJson(req);
    if (typeof prompt !== 'string' || !prompt.trim()) throw new RakenError('empty_prompt', 'Write a prompt first.');

    let convo = conversationId ? conversation(user, conversationId) : null;
    if (convo && running.has(convo.id)) throw new RakenError('busy', 'Raken is still answering in this conversation.');
    const charged = charge(user.account, { tool, modelId, prompt, ultra: Boolean(ultra) });
    if (!convo) {
      const id = randomUUID();
      convo = data.conversations[id] = {
        id,
        userId: user.id,
        title: prompt.trim().slice(0, 60),
        createdAt: new Date().toISOString(),
        history: [],
        display: [],
      };
    }
    running.add(convo.id);
    db.save();

    const send = sse(res);
    send('start', { conversationId: convo.id, title: convo.title, account: me(user) });
    const userTurn = { role: 'user', text: prompt, tool, model: modelId };

    try {
      const kind = ai.outputKind(tool, modelId);
      let reply;
      if (!kind) {
        convo.history.push({ role: 'user', content: prompt });
        try {
          const result = await ai.chat({
            modelId,
            ultra,
            history: convo.history,
            onText: (text) => send('delta', { text }),
          });
          convo.history.push({ role: 'assistant', content: result.content });
          reply = { text: result.text };
        } catch (err) {
          convo.history.pop();
          throw err;
        }
      } else {
        send('status', { text: `${MODELS[modelId].name} is working…` });
        const out = await ai.create({ kind, modelId, ultra, prompt });
        if (kind === 'work') {
          reply = { text: out.summary, files: out.files.map((f) => ({ name: f.name, content: f.content })) };
        } else if (kind === 'mesh') {
          reply = { text: out.title, files: [{ name: `${slug(out.title)}.obj`, content: out.obj }], preview: { type: 'mesh' } };
        } else {
          reply = { text: out.title, files: [{ name: `${slug(out.title)}.svg`, content: out.svg }], preview: { type: kind } };
        }
      }

      const aiTurn = { role: 'ai', ...reply, model: modelId, charged, ultra: Boolean(ultra) };
      convo.display.push(userTurn, aiTurn);
      convo.updatedAt = new Date().toISOString();
      send('done', { message: aiTurn, account: me(user) });
    } catch (err) {
      refund(user.account, charged);
      const known = err instanceof RakenError;
      if (!known) console.error(err);
      send('error', { message: known ? err.message : 'Something went wrong. Your credits were refunded.', account: me(user) });
    } finally {
      running.delete(convo.id);
      db.save();
      res.end();
    }
  }

  const routes = {
    'GET /api/catalog': () => ({
      models: MODELS,
      tools: TOOLS,
      toolModels: TOOL_MODELS,
      plans: PLANS,
      billing: billing.configured,
    }),

    'POST /api/signup': async (req, res) => {
      const { email, password } = await readJson(req);
      const { user, token } = await auth.signup(email, password);
      sendJson(res, 200, me(user), { 'set-cookie': sessionCookie(req, token) });
    },

    'POST /api/login': async (req, res) => {
      const { email, password } = await readJson(req);
      const { user, token } = await auth.login(email, password);
      db.save();
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
        .map(({ id, title, updatedAt, createdAt }) => ({ id, title, updatedAt: updatedAt ?? createdAt }));
    },

    'GET /api/conversation': (req) => {
      const id = new URL(req.url, 'http://x').searchParams.get('id');
      const { title, display } = conversation(currentUser(req), id);
      return { id, title, messages: display };
    },

    'POST /api/conversation/delete': async (req) => {
      const { id } = await readJson(req);
      conversation(currentUser(req), id);
      delete data.conversations[id];
      db.save();
      return { ok: true };
    },

    'POST /api/quote': async (req) => {
      const { modelId, prompt = '' } = await readJson(req);
      if (!MODELS[modelId]) throw new RakenError('bad_model', `Unknown model: ${modelId}`);
      return { credits: creditCost(modelId, prompt), ultraCredits: ultraCost(modelId, prompt) };
    },

    'POST /api/run': run,

    'POST /api/billing/checkout': async (req) => {
      const user = currentUser(req);
      const { plan } = await readJson(req);
      return { url: await billing.checkout(user, plan, origin(req)) };
    },

    'POST /api/billing/portal': async (req) => ({ url: await billing.portal(currentUser(req), origin(req)) }),

    'POST /api/billing/webhook': async (req) => {
      await billing.webhook(await readBody(req, 1_000_000), req.headers['stripe-signature']);
      return { received: true };
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
