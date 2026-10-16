import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MODELS, PLANS, TOOLS, TOOL_MODELS } from './src/catalog.js';
import { RakenError, changePlan, charge, creditCost, newAccount, refreshAllowance, ultraCost } from './src/credits.js';
import { generate } from './src/provider.js';

const PORT = Number(process.env.PORT ?? 3000);
const WEB_ROOT = join(import.meta.dirname, 'web');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

// In-memory accounts keyed by session token. Swap for a database in production.
const accounts = new Map();

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new RakenError('too_large', 'Request body too large.');
  }
  return raw ? JSON.parse(raw) : {};
}

function account(req) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  const acct = token && accounts.get(token);
  if (!acct) throw new RakenError('unauthorized', 'Log in first.');
  return refreshAllowance(acct);
}

function publicAccount(acct) {
  const { plan, credits, ultraCredits } = acct;
  return { plan, planName: PLANS[plan].name, credits, ultraCredits };
}

const routes = {
  'GET /api/catalog': () => ({ models: MODELS, tools: TOOLS, toolModels: TOOL_MODELS, plans: PLANS }),

  'POST /api/login': () => {
    const token = randomUUID();
    accounts.set(token, refreshAllowance(newAccount('free')));
    return { token, account: publicAccount(accounts.get(token)) };
  },

  'GET /api/me': (req) => publicAccount(account(req)),

  // Demo checkout: switches plan immediately. Wire to a payment provider before launch.
  'POST /api/plan': async (req) => {
    const acct = account(req);
    const { plan } = await readJson(req);
    if (!PLANS[plan]) throw new RakenError('bad_plan', `Unknown plan: ${plan}`);
    return publicAccount(changePlan(acct, plan));
  },

  'POST /api/quote': async (req) => {
    const { modelId, prompt = '' } = await readJson(req);
    if (!MODELS[modelId]) throw new RakenError('bad_model', `Unknown model: ${modelId}`);
    return { credits: creditCost(modelId, prompt), ultraCredits: ultraCost(modelId, prompt) };
  },

  'POST /api/run': async (req) => {
    const acct = account(req);
    const { tool, modelId, prompt, ultra = false } = await readJson(req);
    if (typeof prompt !== 'string' || !prompt.trim()) throw new RakenError('empty_prompt', 'Write a prompt first.');
    const charged = charge(acct, { tool, modelId, prompt, ultra: Boolean(ultra) });
    const output = await generate({ tool, modelId, prompt, ultra: Boolean(ultra) });
    return { ...output, charged, account: publicAccount(acct) };
  },
};

const ERROR_STATUS = { unauthorized: 401, no_credits: 402, no_ultra: 402, tool_locked: 403, model_locked: 403 };

async function serveStatic(req, res) {
  const path = normalize(new URL(req.url, 'http://x').pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(WEB_ROOT, path === '/' ? 'index.html' : path);
  if (!file.startsWith(WEB_ROOT)) return send(res, 404, { error: 'not_found' });
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    send(res, 404, { error: 'not_found' });
  }
}

export const server = createServer(async (req, res) => {
  const route = routes[`${req.method} ${new URL(req.url, 'http://x').pathname}`];
  if (!route) return serveStatic(req, res);
  try {
    send(res, 200, await route(req));
  } catch (err) {
    if (err instanceof RakenError) return send(res, ERROR_STATUS[err.code] ?? 400, { error: err.code, message: err.message });
    if (err instanceof SyntaxError) return send(res, 400, { error: 'bad_json', message: 'Invalid JSON body.' });
    console.error(err);
    send(res, 500, { error: 'server_error', message: 'Something went wrong.' });
  }
});

if (process.argv[1] === import.meta.filename) {
  server.listen(PORT, () => console.log(`Raken running at http://localhost:${PORT}`));
}
