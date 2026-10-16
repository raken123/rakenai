import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MODELS, PLANS, TOOL_MODELS, TRAINING_EPOCHS } from '../src/catalog.js';
import { RakenError, changePlan, charge, creditCost, newAccount, refreshAllowance, ultraCost } from '../src/credits.js';

const day1 = new Date('2026-10-16T08:00:00Z');
const day1Later = new Date('2026-10-16T22:00:00Z');
const day2 = new Date('2026-10-17T08:00:00Z');
const nextMonth = new Date('2026-11-01T00:00:00Z');

test('free plan gets 10 credits once per day, not per login', () => {
  const acct = refreshAllowance(newAccount('free'), day1);
  assert.equal(acct.credits, 10);
  charge(acct, { tool: 'chat', modelId: 'raken-standard', prompt: 'hi' });
  assert.equal(acct.credits, 9);
  refreshAllowance(acct, day1Later);
  assert.equal(acct.credits, 9);
  refreshAllowance(acct, day2);
  assert.equal(acct.credits, 10);
});

test('free plan only has Raken Standard and Chat', () => {
  const acct = refreshAllowance(newAccount('free'), day1);
  assert.throws(() => charge(acct, { tool: 'chat', modelId: 'raken-plus', prompt: 'hi' }), { code: 'model_locked' });
  assert.throws(() => charge(acct, { tool: 'work', modelId: 'raken-standard', prompt: 'hi' }), { code: 'tool_locked' });
  assert.throws(() => charge(acct, { tool: 'chat', modelId: 'raken-standard', prompt: 'hi', ultra: true }), { code: 'no_ultra' });
});

test('paid plans refill monthly allowances', () => {
  const lite = changePlan(newAccount(), 'lite', day1);
  assert.deepEqual([lite.credits, lite.ultraCredits], [300, 5]);
  const plus = changePlan(newAccount(), 'plus', day1);
  assert.deepEqual([plus.credits, plus.ultraCredits], [50_000, 70]);

  charge(lite, { tool: 'vidful', modelId: 'raken-vidful-1', prompt: 'a dragon', ultra: true });
  assert.equal(lite.ultraCredits, 4);
  refreshAllowance(lite, day2);
  assert.equal(lite.ultraCredits, 4);
  refreshAllowance(lite, nextMonth);
  assert.equal(lite.ultraCredits, 5);
});

test('cost grows with prompt size and model', () => {
  const short = 'hello';
  const long = 'x'.repeat(5000);
  assert.equal(creditCost('raken-standard', short), 1);
  assert.ok(creditCost('raken-standard', long) > creditCost('raken-standard', short));
  assert.ok(creditCost('raken-astryx', short) > creditCost('raken-mini', short));
  assert.equal(ultraCost('raken-standard', short), 1);
});

test('running out of credits is refused without charging', () => {
  const acct = refreshAllowance(newAccount('free'), day1);
  const huge = 'x'.repeat(20_000);
  assert.throws(() => charge(acct, { tool: 'chat', modelId: 'raken-standard', prompt: huge }), RakenError);
  assert.equal(acct.credits, 10);
});

test('catalog is consistent', async () => {
  for (const plan of Object.values(PLANS)) {
    for (const id of plan.models) assert.ok(MODELS[id], id);
  }
  for (const ids of Object.values(TOOL_MODELS)) {
    for (const id of ids) assert.ok(MODELS[id], id);
  }
  const { runs } = JSON.parse(await readFile(new URL('../training/models.json', import.meta.url)));
  assert.deepEqual(Object.keys(runs).sort(), Object.keys(MODELS).sort());
  for (const { epochs } of Object.values(runs)) {
    assert.ok(epochs >= TRAINING_EPOCHS.min && epochs <= TRAINING_EPOCHS.max);
  }
});
