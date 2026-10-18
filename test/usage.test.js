import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, PLANS, TOOL_MODELS, weeklyUnits } from '../src/catalog.js';
import { addPack, authorize, changePlan, newAccount, settle, usageSummary, weekStart } from '../src/usage.js';

const monday = new Date('2026-10-12T08:00:00Z');
const sunday = new Date('2026-10-18T23:00:00Z');
const nextMonday = new Date('2026-10-19T00:00:00Z');

test('weeks start on Monday UTC', () => {
  assert.equal(weekStart(monday), '2026-10-12');
  assert.equal(weekStart(sunday), '2026-10-12');
  assert.equal(weekStart(nextMonday), '2026-10-19');
});

test('plan limits: Plus is 3x Free, Pro 6x, Ultra 5x Pro', () => {
  assert.equal(weeklyUnits('plus'), 3 * weeklyUnits('free'));
  assert.equal(weeklyUnits('pro'), 6 * weeklyUnits('free'));
  assert.equal(weeklyUnits('ultra'), 5 * weeklyUnits('pro'));
});

test('plan access matches the plan list', () => {
  const free = newAccount('free');
  authorize(free, { tool: 'chat', modelId: 'raken-1-flash' });
  authorize(free, { tool: 'chat', modelId: 'raken-1-standard' });
  assert.throws(() => authorize(free, { tool: 'chat', modelId: 'raken-1-pro' }), { code: 'model_locked' });
  assert.throws(() => authorize(free, { tool: 'code', modelId: 'raken-1-pro' }), { code: 'tool_locked' });

  const plus = newAccount('plus');
  authorize(plus, { tool: 'code', modelId: 'raken-1-pro' });
  authorize(plus, { tool: 'work', modelId: 'raken-1-pro' });
  assert.throws(() => authorize(plus, { tool: 'vidful', modelId: 'raken-1-vidful' }), { code: 'tool_locked' });
  assert.throws(() => authorize(plus, { tool: 'code', modelId: 'raken-1-ultra' }), { code: 'model_locked' });

  const pro = newAccount('pro');
  authorize(pro, { tool: 'vidful', modelId: 'raken-1-vidful' });
  authorize(pro, { tool: 'work', modelId: 'raken-1-ultra' });
  assert.throws(() => authorize(pro, { tool: 'work', modelId: 'raken-2-asteron' }), { code: 'model_locked' });

  authorize(newAccount('ultra'), { tool: 'work', modelId: 'raken-2-asteron' });
  // Flash and Standard are chat-only.
  assert.throws(() => authorize(newAccount('ultra'), { tool: 'code', modelId: 'raken-1-flash' }), { code: 'bad_model' });
});

test('usage fills the weekly allowance, then Credits, then stops', () => {
  const acct = newAccount('free');
  const limit = weeklyUnits('free') * 1000;
  authorize(acct, { tool: 'chat', modelId: 'raken-1-flash' }, monday);
  let charged = settle(acct, { modelId: 'raken-1-flash', inputTokens: limit / 2, outputTokens: 0 });
  assert.equal(charged.credits, 0);
  assert.equal(usageSummary(acct, monday).usedPercent, 50);

  // Standard counts double, so this crosses the limit; with no Credits the rest is not charged.
  settle(acct, { modelId: 'raken-1-standard', inputTokens: limit, outputTokens: 0 });
  assert.equal(usageSummary(acct, monday).usedPercent, 100);
  assert.throws(() => authorize(acct, { tool: 'chat', modelId: 'raken-1-flash' }, monday), { code: 'limit_reached' });

  addPack(acct, 'credits-200');
  authorize(acct, { tool: 'chat', modelId: 'raken-1-flash' }, monday);
  charged = settle(acct, { modelId: 'raken-1-flash', inputTokens: 1500, outputTokens: 500 });
  assert.equal(charged.credits, 2);
  assert.equal(acct.credits, 198);

  // A new week resets the allowance; bought Credits stay.
  assert.equal(usageSummary(acct, nextMonday).usedPercent, 0);
  assert.equal(acct.credits, 198);
});

test('Ultra Credits pay for the priority path and skip the weekly allowance', () => {
  const acct = newAccount('pro');
  assert.throws(() => authorize(acct, { tool: 'code', modelId: 'raken-1-pro', ultra: true }), { code: 'no_ultra' });
  addPack(acct, 'ultra-5');
  authorize(acct, { tool: 'code', modelId: 'raken-1-pro', ultra: true });
  const charged = settle(acct, { modelId: 'raken-1-pro', ultra: true, inputTokens: 50_000, outputTokens: 40_000 });
  assert.deepEqual(charged, { units: 0, credits: 0, ultraCredits: 3 });
  assert.equal(acct.ultraCredits, 2);
  assert.equal(acct.usedTokens, 0);
});

test('changing plan keeps bought Credits', () => {
  const acct = newAccount('free');
  addPack(acct, 'credits-1000');
  changePlan(acct, 'ultra');
  assert.deepEqual([acct.plan, acct.credits], ['ultra', 1000]);
});

test('catalog is consistent', () => {
  for (const plan of Object.values(PLANS)) {
    for (const id of plan.models) assert.ok(MODELS[id], id);
  }
  for (const ids of Object.values(TOOL_MODELS)) {
    for (const id of ids) assert.ok(MODELS[id], id);
  }
});
