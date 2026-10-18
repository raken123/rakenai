import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.js';

// A stand-in for the Claude Messages API that records each request and streams
// back a scripted reply.
const requests = [];
let smallTaskText = JSON.stringify({ size: 'small', estimate: 'about an hour', reason: 'Simple.' });
let reply = () => ({ text: 'Hello from Raken!' });

const fakeApi = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  requests.push({ url: req.url, headers: req.headers, body });
  const isAssess = body.system?.startsWith('Estimate how much work');
  const { text, stopReason = 'end_turn', status } = isAssess ? { text: smallTaskText } : reply(body);
  if (status) {
    res.writeHead(status, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }));
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  send('message_start', {
    message: { id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 0 } },
  });
  send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
  for (const piece of text.match(/.{1,8}/gs) ?? []) send('content_block_delta', { index: 0, delta: { type: 'text_delta', text: piece } });
  send('content_block_stop', { index: 0 });
  send('message_delta', { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 500 } });
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
  app = createApp({ db });
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

async function signup(email, plan) {
  const c = client();
  await c.json('POST', '/api/signup', { email, password: 'password123' });
  if (plan) await c.json('POST', '/api/billing/subscribe', { plan });
  return c;
}

test('sign up, log in and log out', async () => {
  const c = client();
  assert.equal((await c.json('GET', '/api/me')).status, 401);
  assert.equal((await c.json('POST', '/api/signup', { email: 'a@raken.ai', password: 'short' })).status, 400);
  const res = await c.json('POST', '/api/signup', { email: 'A@raken.ai', password: 'password123' });
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.plan, res.body.usedPercent, res.body.weeklyUnits], ['free', 0, 500]);
  assert.equal((await c.json('POST', '/api/signup', { email: 'a@raken.ai', password: 'password123' })).status, 409);
  await c.json('POST', '/api/logout');
  assert.equal((await c.json('GET', '/api/me')).status, 401);
  assert.equal((await c.json('POST', '/api/login', { email: 'a@raken.ai', password: 'wrongpass1' })).status, 401);
  assert.equal((await c.json('POST', '/api/login', { email: 'a@raken.ai', password: 'password123' })).status, 200);
});

test('chat streams a reply, keeps the conversation and charges weekly usage', async () => {
  const c = await signup('chat@raken.ai');
  requests.length = 0;

  const first = await c.run({ tool: 'chat', modelId: 'raken-1-flash', prompt: 'Hi Raken' });
  const deltas = first.events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
  assert.equal(deltas, 'Hello from Raken!');
  assert.equal(first.last.event, 'done');
  // 1,500 tokens on Flash (weight 1) of a 500,000-token week.
  assert.equal(first.last.data.account.usedPercent, 0.3);

  const sent = requests[0];
  assert.equal(sent.body.model, 'claude-haiku-5-5');
  assert.equal(sent.body.output_config.effort, 'low');
  assert.equal(sent.body.fallbacks, undefined);

  const conversationId = first.events[0].data.conversationId;
  await c.run({ tool: 'chat', modelId: 'raken-1-standard', prompt: 'And again', conversationId });
  const second = requests.at(-1);
  assert.equal(second.body.model, 'claude-sonnet-5-5');
  assert.equal(second.body.fallbacks, 'default');
  assert.deepEqual(second.body.messages.map((m) => m.role), ['user', 'assistant', 'user']);

  const convo = await c.json('GET', `/api/conversation?id=${conversationId}`);
  assert.equal(convo.body.messages.length, 4);
  assert.equal((await c.json('GET', '/api/conversations')).body.length, 1);
});

test('locked tools and models are refused before any AI call', async () => {
  const c = await signup('locked@raken.ai');
  requests.length = 0;
  assert.equal((await c.run({ tool: 'chat', modelId: 'raken-1-pro', prompt: 'Hi' })).status, 403);
  assert.equal((await c.run({ tool: 'code', modelId: 'raken-1-pro', prompt: 'Hi' })).status, 403);
  assert.equal(requests.length, 0);
});

test('failed and refused requests cost nothing', async () => {
  const c = await signup('refund@raken.ai');

  reply = () => ({ status: 400 });
  let res = await c.run({ tool: 'chat', modelId: 'raken-1-flash', prompt: 'Hi' });
  assert.equal(res.last.event, 'error');
  assert.equal(res.last.data.account.usedPercent, 0);

  reply = () => ({ text: '', stopReason: 'refusal' });
  res = await c.run({ tool: 'chat', modelId: 'raken-1-flash', prompt: 'Hi' });
  assert.match(res.last.data.message, /can't help/);
  assert.equal(res.last.data.account.usedPercent, 0);
  reply = () => ({ text: 'Hello from Raken!' });
});

test('Code agent builds files, then edits them in the same conversation', async () => {
  const c = await signup('code@raken.ai', 'plus');
  requests.length = 0;

  reply = () => ({ text: JSON.stringify({ summary: 'Made a site.', files: [{ path: '../index.html', content: '<h1>Hi</h1>' }] }) });
  const first = await c.run({ tool: 'code', modelId: 'raken-1-pro', prompt: 'Make a website' });
  assert.equal(first.last.event, 'done');
  assert.deepEqual(first.last.data.message.files, [{ path: 'index.html', content: '<h1>Hi</h1>' }]);
  assert.ok(first.events.some((e) => e.event === 'status' && e.data.text === 'Writing ../index.html…'));
  const work = requests.at(-1);
  assert.equal(work.body.model, 'claude-opus-5-5');
  assert.equal(work.body.output_config.format.type, 'json_schema');

  reply = () => ({ text: JSON.stringify({ summary: 'Made it blue.', files: [{ path: 'index.html', content: '<h1 style="color:blue">Hi</h1>' }] }) });
  const conversationId = first.events.find((e) => e.event === 'start').data.conversationId;
  await c.run({ tool: 'code', modelId: 'raken-1-pro', prompt: 'Make it blue', conversationId });
  const edit = requests.at(-1).body.messages;
  assert.deepEqual(edit.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.match(edit[2].content, /<file path="index.html">\n<h1>Hi<\/h1>/);
  reply = () => ({ text: 'Hello from Raken!' });
});

test('huge Code tasks suggest Ultra Credits; Ultra runs on the fast priority path', async () => {
  const c = await signup('ultra@raken.ai', 'pro');
  const huge = JSON.stringify({ size: 'huge', estimate: 'about 2 weeks', reason: 'A full product.' });
  const original = smallTaskOverride(huge);
  requests.length = 0;

  const res = await c.run({ tool: 'code', modelId: 'raken-1-ultra', prompt: 'Build a whole operating system' });
  assert.equal(res.last.event, 'suggest_ultra');
  assert.equal(res.last.data.estimate, 'about 2 weeks');
  assert.equal(requests.length, 1);
  original();

  assert.equal((await c.run({ tool: 'code', modelId: 'raken-1-ultra', prompt: 'x', ultra: true })).status, 402);
  const bought = await c.json('POST', '/api/billing/buy', { pack: 'ultra-5' });
  assert.equal(bought.body.account.ultraCredits, 5);
  assert.equal(bought.body.order.demo, true);

  reply = () => ({ text: JSON.stringify({ summary: 'Done.', files: [{ path: 'main.bf', content: '++++++++[>++++++++<-]>+.' }] }) });
  requests.length = 0;
  const ultra = await c.run({ tool: 'code', modelId: 'raken-1-ultra', prompt: 'Build a whole operating system', ultra: true });
  assert.equal(ultra.last.event, 'done');
  assert.equal(ultra.last.data.message.charged.ultraCredits, 1);
  assert.equal(ultra.last.data.account.ultraCredits, 4);
  assert.equal(ultra.last.data.account.usedPercent, 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.speed, 'fast');
  assert.equal(requests[0].body.output_config.effort, 'max');
  assert.match(requests[0].headers['anthropic-beta'], /fast-mode-2026-02-01/);

  // "Run anyway" skips the size check.
  requests.length = 0;
  await c.run({ tool: 'code', modelId: 'raken-1-ultra', prompt: 'Build a whole operating system', skipCheck: true });
  assert.equal(requests.length, 1);
  reply = () => ({ text: 'Hello from Raken!' });
});

test('Vidful makes a movie; Asteron runs on the top model', async () => {
  const c = await signup('vid@raken.ai', 'ultra');
  reply = () => ({ text: JSON.stringify({ title: 'Red Fox', svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' }) });
  const res = await c.run({ tool: 'vidful', modelId: 'raken-1-vidful', prompt: 'A red fox runs' });
  assert.equal(res.last.data.message.files[0].path, 'red-fox.svg');
  assert.equal(res.last.data.message.preview, 'movie');

  reply = () => ({ text: 'On it.' });
  await c.run({ tool: 'chat', modelId: 'raken-2-asteron', prompt: 'Run my job' });
  assert.equal(requests.at(-1).body.model, 'claude-fable-5-1');
  assert.equal(requests.at(-1).body.output_config.effort, 'xhigh');
  reply = () => ({ text: 'Hello from Raken!' });
});

test('demo payments change plans and record orders', async () => {
  const c = await signup('bill@raken.ai');
  const catalog = (await c.json('GET', '/api/catalog')).body;
  assert.equal(catalog.demoPayments, true);
  assert.deepEqual(Object.keys(catalog.plans), ['free', 'plus', 'pro', 'ultra']);
  assert.deepEqual(Object.values(catalog.plans).map((p) => p.priceUsd), [0, 3, 20, 500]);

  const res = await c.json('POST', '/api/billing/subscribe', { plan: 'pro' });
  assert.deepEqual([res.body.account.plan, res.body.account.weeklyUnits], ['pro', 3000]);
  assert.equal((await c.json('POST', '/api/billing/subscribe', { plan: 'pro' })).status, 409);
  await c.json('POST', '/api/billing/buy', { pack: 'credits-1000' });
  const history = (await c.json('GET', '/api/billing/history')).body;
  assert.deepEqual(history.map((o) => o.item), ['1,000 Credits', 'Pro plan']);
});

test('serves the HTML pages', async () => {
  for (const page of ['/', '/login.html', '/app.html']) {
    const res = await fetch(base + page);
    assert.equal(res.status, 200, page);
    assert.match(res.headers.get('content-type'), /text\/html/);
  }
  assert.equal((await fetch(`${base}/../package.json`)).status, 404);
});

function smallTaskOverride(text) {
  const before = smallTaskText;
  smallTaskText = text;
  return () => (smallTaskText = before);
}
