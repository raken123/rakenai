import { MODELS, PACKS, PLANS, TOOL_MODELS, TOOLS, weeklyUnits } from './catalog.js';

// How usage works:
// 1. Every plan has a weekly allowance, shown as a percentage. It resets each
//    Monday at 00:00 UTC.
// 2. When the allowance runs out, Credits keep you going (1 credit = 1 unit).
// 3. Ultra Credits send a task to the priority path (top model, fast output)
//    and are paid for separately; they don't touch the weekly allowance.
//
// Requests are charged after they finish, from the tokens actually used, so a
// failed or declined request costs nothing.

const TOKENS_PER_UNIT = 1000;
// One Ultra Credit covers this many tokens on the priority path.
export const TOKENS_PER_ULTRA_CREDIT = 40_000;

export class RakenError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

export function weekStart(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function newAccount(plan = 'free') {
  if (!PLANS[plan]) throw new Error(`Unknown plan: ${plan}`);
  return { plan, week: null, usedTokens: 0, credits: 0, ultraCredits: 0 };
}

// Starts a fresh week's allowance if the week has turned over.
export function refreshWeek(account, now = new Date()) {
  const week = weekStart(now);
  if (account.week !== week) {
    account.week = week;
    account.usedTokens = 0;
  }
  return account;
}

function limitTokens(account) {
  return weeklyUnits(account.plan) * TOKENS_PER_UNIT;
}

export function usageSummary(account, now = new Date()) {
  refreshWeek(account, now);
  const limit = limitTokens(account);
  const resets = new Date(`${account.week}T00:00:00Z`);
  resets.setUTCDate(resets.getUTCDate() + 7);
  return {
    plan: account.plan,
    planName: PLANS[account.plan].name,
    usedPercent: Math.min(100, Math.round((account.usedTokens / limit) * 1000) / 10),
    weeklyUnits: weeklyUnits(account.plan),
    credits: account.credits,
    ultraCredits: account.ultraCredits,
    resetsAt: resets.toISOString(),
  };
}

// Checks plan access and that something is left to pay with. Charges nothing.
export function authorize(account, { tool, modelId, ultra = false }, now = new Date()) {
  refreshWeek(account, now);
  const plan = PLANS[account.plan];
  if (!TOOLS[tool]) throw new RakenError('bad_tool', `Unknown tool: ${tool}`);
  if (!plan.tools.includes(tool)) {
    throw new RakenError('tool_locked', `The ${plan.name} plan doesn't include ${TOOLS[tool].name}. Upgrade to use it.`);
  }
  if (!TOOL_MODELS[tool].includes(modelId)) {
    throw new RakenError('bad_model', `${MODELS[modelId]?.name ?? modelId} can't be used in ${TOOLS[tool].name}.`);
  }
  if (!plan.models.includes(modelId)) {
    throw new RakenError('model_locked', `The ${plan.name} plan doesn't include ${MODELS[modelId].name}. Upgrade to use it.`);
  }
  if (ultra) {
    if (account.ultraCredits < 1) throw new RakenError('no_ultra', "You don't have any Ultra Credits. Buy some to use the priority path.");
  } else if (account.usedTokens >= limitTokens(account) && account.credits < 1) {
    throw new RakenError('limit_reached', "You've used 100% of your weekly usage. Buy Credits to keep going, or wait for the weekly reset.");
  }
}

// Charges a finished request. The request that crosses a limit is allowed to
// finish; anything beyond what's left is not charged.
export function settle(account, { modelId, ultra = false, inputTokens, outputTokens }) {
  const tokens = inputTokens + outputTokens;
  if (ultra) {
    const cost = Math.min(account.ultraCredits, Math.max(1, Math.ceil(tokens / TOKENS_PER_ULTRA_CREDIT)));
    account.ultraCredits -= cost;
    return { units: 0, credits: 0, ultraCredits: cost };
  }
  const weighted = tokens * MODELS[modelId].weight;
  const fromAllowance = Math.min(weighted, Math.max(0, limitTokens(account) - account.usedTokens));
  account.usedTokens += fromAllowance;
  const overflow = weighted - fromAllowance;
  const credits = Math.min(account.credits, Math.ceil(overflow / TOKENS_PER_UNIT));
  account.credits -= credits;
  return { units: Math.round(weighted / 100) / 10, credits, ultraCredits: 0 };
}

export function changePlan(account, plan) {
  if (!PLANS[plan]) throw new RakenError('bad_plan', `Unknown plan: ${plan}`);
  account.plan = plan;
  return account;
}

export function addPack(account, packId) {
  const pack = PACKS[packId];
  if (!pack) throw new RakenError('bad_pack', `Unknown pack: ${packId}`);
  account[pack.kind] += pack.amount;
  return pack;
}
