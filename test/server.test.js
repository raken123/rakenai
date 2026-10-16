import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.js';
import { changePlan } from '../src/credits.js';

// A stand-in for the Claude Messages API that records each request and streams
// back a scripted reply.
const requests = [];
let reply = () => ({ text: 'Hello from Raken!' });

const fakeApi = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  requests.push({ url: req.url, headers: req.headers, body });
  const { text, stopReason = 'end_turn', status } = reply(body);
  if (status) {
    res.writeHead(status, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }));
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  send('message_start', {
    message: { id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 0 } },
  });
  send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
  for (const piece of text.match(/.{1,8}/gs) ?? []) send('content_block_delta', { index: 0, delta: { type: 'text_delta', text: piece } });
  send('content_block_stop', { index: 0 });
  send('message_delta', { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 7 } });
  send('message_stop', {});
  res.end();
});

let app;
let base;
let db;

before(async () => {
  await new Promise((r) => fakeApi.listen(0, '127.0.0.1', r));
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fakeApi.address().port}`;
  const { createApp } = await import('../server.js');
  db = openDb(mkdtempSync(join(tmpdir(), 'raken-')));
  app = createApp({ db, env: {} });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.address().port}`;
});

after(() => {
  app.close();
  fakeApi.close();
});

function client() {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { cookie, ...(body && { 'content-type': 'application/json' }) },
      body: body && JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  };
  return {
    call,
    json: async (method, path, body) => {
      const res = await call(method, path, body);
      return { status: res.status, body: await res.json() };
    },
    async run(body) {
      const res = await call('POST', '/api/run', body);
      if (!res.headers.get('content-type').startsWith('text/event-stream')) return { status: res.status, body: await res.json() };
      const events = [...(await res.text()).matchAll(/event: (.*)\ndata: (.*)\n\n/g)].map(([, event, data]) => ({ event, data: JSON.parse(data) }));
      return { status: res.status, events, last: events.at(-1) };
    },
  };
}

test('sign up, log in and log out', async () => {
  const c = client();
  assert.equal((await c.json('GET', '/api/me')).status, 401);
  assert.equal((await c.json('POST', '/api/signup', { email: 'a@raken.ai', password: 'short' })).status, 400);
  const signup = await c.json('POST', '/api/signup', { email: 'A@raken.ai', password: 'password123' });
  assert.equal(signup.status, 200);
  assert.deepEqual([signup.body.plan, signup.body.credits], ['free', 10]);
  assert.equal((await c.json('POST', '/api/signup', { email: 'a@raken.ai', password: 'password123' })).status, 409);
  await c.json('POST', '/api/logout');
  assert.equal((await c.json('GET', '/api/me')).status, 401);
  assert.equal((await c.json('POST', '/api/login', { email: 'a@raken.ai', password: 'wrongpass1' })).status, 401);
  assert.equal((await c.json('POST', '/api/login', { email: 'a@raken.ai', password: 'password123' })).status, 200);
});

test('chat streams a real model reply and keeps the conversation', async () => {
  const c = client();
  await c.json('POST', '/api/signup', { email: 'chat@raken.ai', password: 'password123' });
  requests.length = 0;

  const first = await c.run({ tool: 'chat', modelId: 'raken-standard', prompt: 'Hi Raken' });
  const deltas = first.events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
  assert.equal(deltas, 'Hello from Raken!');
  assert.equal(first.last.event, 'done');
  assert.equal(first.last.data.account.credits, 9);

  const sent = requests[0];
  assert.equal(sent.body.model, 'claude-sonnet-5-5');
  assert.equal(sent.body.output_config.effort, 'low');
  assert.equal(sent.body.fallbacks, 'default');
  assert.match(sent.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);

  const conversationId = first.events[0].data.conversationId;
  await c.run({ tool: 'chat', modelId: 'raken-standard', prompt: 'And again', conversationId });
  const history = requests[1].body.messages;
  assert.deepEqual(history.map((m) => m.role), ['user', 'assistant', 'user']);

  const convo = await c.json('GET', `/api/conversation?id=${conversationId}`);
  assert.equal(convo.body.messages.length, 4);
  assert.equal((await c.json('GET', '/api/conversations')).body.length, 1);
});

test('locked models are refused before any AI call', async () => {
  const c = client();
  await c.json('POST', '/api/signup', { email: 'locked@raken.ai', password: 'password123' });
  requests.length = 0;
  const res = await c.run({ tool: 'chat', modelId: 'raken-astryx', prompt: 'Hi' });
  assert.equal(res.status, 403);
  assert.equal(requests.length, 0);
});

test('failed and refused requests refund credits', async () => {
  const c = client();
  await c.json('POST', '/api/signup', { email: 'refund@raken.ai', password: 'password123' });

  reply = () => ({ status: 400 });
  let res = await c.run({ tool: 'chat', modelId: 'raken-standard', prompt: 'Hi' });
  assert.equal(res.last.event, 'error');
  assert.equal(res.last.data.account.credits, 10);

  reply = () => ({ text: '', stopReason: 'refusal' });
  res = await c.run({ tool: 'chat', modelId: 'raken-standard', prompt: 'Hi' });
  assert.equal(res.last.event, 'error');
  assert.match(res.last.data.message, /can't help/);
  assert.equal(res.last.data.account.credits, 10);
  reply = () => ({ text: 'Hello from Raken!' });
});

test('Plus plan: Work, Imge, Vidful, Mesh and Ultra all produce real outputs', async () => {
  const c = client();
  await c.json('POST', '/api/signup', { email: 'plus@raken.ai', password: 'password123' });
  changePlan(db.data.users[db.data.emailIndex['plus@raken.ai']].account, 'plus');
  requests.length = 0;

  reply = () => ({ text: JSON.stringify({ summary: 'Made a site.', files: [{ name: 'index.html', content: '<h1>Hi</h1>' }] }) });
  let res = await c.run({ tool: 'work', modelId: 'raken-astryx', prompt: 'Make a website' });
  assert.equal(res.last.event, 'done');
  assert.deepEqual(res.last.data.message.files, [{ name: 'index.html', content: '<h1>Hi</h1>' }]);
  assert.equal(requests.at(-1).body.output_config.format.type, 'json_schema');

  reply = () => ({ text: JSON.stringify({ title: 'Red Fox', svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' }) });
  res = await c.run({ tool: 'chat', modelId: 'raken-imge-1', prompt: 'A red fox' });
  assert.equal(res.last.data.message.files[0].name, 'red-fox.svg');
  assert.equal(res.last.data.message.preview.type, 'image');

  res = await c.run({ tool: 'vidful', modelId: 'raken-vidful-1', prompt: 'A red fox runs' });
  assert.equal(res.last.data.message.preview.type, 'video');

  reply = () => ({ text: JSON.stringify({ title: 'Cube', obj: 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3' }) });
  res = await c.run({ tool: 'chat', modelId: 'raken-mesh-1', prompt: 'A cube', ultra: true });
  assert.equal(res.last.data.message.files[0].name, 'cube.obj');
  assert.equal(res.last.data.message.charged.ultraCredits, 1);
  assert.equal(res.last.data.account.ultraCredits, 69);
  const ultraReq = requests.at(-1);
  assert.equal(ultraReq.body.model, 'claude-opus-5-5');
  assert.equal(ultraReq.body.speed, 'fast');
  assert.match(ultraReq.headers['anthropic-beta'], /fast-mode-2026-02-01/);
  reply = () => ({ text: 'Hello from Raken!' });
});

test('billing reports when Stripe is not configured', async () => {
  const c = client();
  await c.json('POST', '/api/signup', { email: 'bill@raken.ai', password: 'password123' });
  assert.equal((await c.json('GET', '/api/catalog')).body.billing, false);
  const res = await c.json('POST', '/api/billing/checkout', { plan: 'lite' });
  assert.equal(res.status, 503);
});

test('serves the HTML pages', async () => {
  for (const page of ['/', '/login.html', '/app.html']) {
    const res = await fetch(base + page);
    assert.equal(res.status, 200, page);
    assert.match(res.headers.get('content-type'), /text\/html/);
  }
  assert.equal((await fetch(`${base}/../package.json`)).status, 404);
});
