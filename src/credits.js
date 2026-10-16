import { MODELS, PLANS, TOOL_MODELS } from './catalog.js';

// Roughly 4 characters per token; every started block of 250 tokens costs one
// credit before the model multiplier is applied.
const CHARS_PER_TOKEN = 4;
const TOKENS_PER_CREDIT = 250;

// One Ultra Credit buys this many credits' worth of work on the priority
// cluster, which runs jobs much faster than the normal queue.
export const CREDITS_PER_ULTRA = 100;

export function estimateTokens(prompt) {
  return Math.max(1, Math.ceil(prompt.trim().length / CHARS_PER_TOKEN));
}

export function creditCost(modelId, prompt) {
  const model = MODELS[modelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  return Math.ceil(estimateTokens(prompt) / TOKENS_PER_CREDIT) * model.creditMultiplier;
}

export function ultraCost(modelId, prompt) {
  return Math.ceil(creditCost(modelId, prompt) / CREDITS_PER_ULTRA);
}

export function utcDay(date) {
  return date.toISOString().slice(0, 10);
}

export function utcMonth(date) {
  return date.toISOString().slice(0, 7);
}

export function newAccount(plan = 'free') {
  if (!PLANS[plan]) throw new Error(`Unknown plan: ${plan}`);
  return { plan, credits: 0, ultraCredits: 0, lastDailyGrant: null, lastMonthlyGrant: null, billedBySubscription: false };
}

// Refills the monthly allowance. Called when a subscription invoice is paid.
export function grantMonthly(account, now = new Date()) {
  const plan = PLANS[account.plan];
  account.credits = plan.monthlyCredits;
  account.ultraCredits = plan.monthlyUltraCredits;
  account.lastMonthlyGrant = utcMonth(now);
  return account;
}

// Applies any daily or monthly allowance the account is owed as of `now`.
// Allowances refill to the plan amount; unused credits do not roll over.
// Accounts paid through a subscription refill when each invoice is paid
// instead of on the calendar month.
export function refreshAllowance(account, now = new Date()) {
  const plan = PLANS[account.plan];
  const day = utcDay(now);
  const month = utcMonth(now);

  if (plan.dailyCredits > 0 && account.lastDailyGrant !== day) {
    account.credits = plan.dailyCredits;
    account.lastDailyGrant = day;
  }
  const monthly = plan.monthlyCredits > 0 || plan.monthlyUltraCredits > 0;
  if (monthly && !account.billedBySubscription && account.lastMonthlyGrant !== month) {
    grantMonthly(account, now);
  }
  return account;
}

export function changePlan(account, plan, { now = new Date(), billedBySubscription = false } = {}) {
  if (!PLANS[plan]) throw new Error(`Unknown plan: ${plan}`);
  if (account.plan === plan && account.billedBySubscription === billedBySubscription) return account;
  Object.assign(account, newAccount(plan), { billedBySubscription });
  if (billedBySubscription) grantMonthly(account, now);
  return refreshAllowance(account, now);
}

export function refund(account, charged) {
  account.credits += charged.credits;
  account.ultraCredits += charged.ultraCredits;
}

export class RakenError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Checks plan access and balance, then deducts the cost. Returns what was charged.
export function charge(account, { tool, modelId, prompt, ultra = false }) {
  const plan = PLANS[account.plan];
  if (!plan.tools.includes(tool)) {
    throw new RakenError('tool_locked', `${plan.name} does not include the ${tool} tool.`);
  }
  if (!TOOL_MODELS[tool]?.includes(modelId)) {
    throw new RakenError('bad_model', `${MODELS[modelId]?.name ?? modelId} can't be used with ${tool}.`);
  }
  if (!plan.models.includes(modelId)) {
    throw new RakenError('model_locked', `${plan.name} does not include ${MODELS[modelId].name}.`);
  }

  if (ultra) {
    const cost = ultraCost(modelId, prompt);
    if (account.ultraCredits < cost) {
      throw new RakenError('no_ultra', `This needs ${cost} Ultra Credits; you have ${account.ultraCredits}.`);
    }
    account.ultraCredits -= cost;
    return { credits: 0, ultraCredits: cost };
  }

  const cost = creditCost(modelId, prompt);
  if (account.credits < cost) {
    throw new RakenError('no_credits', `This needs ${cost} credits; you have ${account.credits}.`);
  }
  account.credits -= cost;
  return { credits: cost, ultraCredits: 0 };
}
