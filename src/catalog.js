// Single source of truth for Raken's models, tools, plans and add-on packs.

export const MODELS = {
  'raken-1-flash': {
    name: 'Raken 1 Flash',
    description: 'Ultrafast. Great for everyday conversations.',
    weight: 1,
  },
  'raken-1-standard': {
    name: 'Raken 1 Standard',
    description: 'Fast. Good for mini apps, documents and more.',
    weight: 2,
  },
  'raken-1-pro': {
    name: 'Raken 1 Pro',
    description: 'Apps, slides, coded images and animations.',
    weight: 5,
  },
  'raken-1-ultra': {
    name: 'Raken 1 Ultra',
    description: 'Deep work that keeps your business running.',
    weight: 10,
  },
  'raken-2-asteron': {
    name: 'Raken 2 Asteron',
    description: 'The most capable Raken. Handles whole jobs end to end.',
    weight: 20,
  },
  'raken-1-vidful': {
    name: 'Raken 1 Vidful',
    description: 'Makes short animated movies.',
    weight: 10,
  },
};

export const TOOLS = {
  chat: { name: 'Chat', description: 'Your normal chat experience.' },
  code: { name: 'Code', description: 'An AI agent that writes and runs code.' },
  work: { name: 'Work', description: 'An AI agent that makes documents, slides and sheets.' },
  vidful: { name: 'Vidful', description: 'Make cool short movies.' },
};

// Which models each tool can run on. Flash and Standard are chat-only.
export const TOOL_MODELS = {
  chat: ['raken-1-flash', 'raken-1-standard', 'raken-1-pro', 'raken-1-ultra', 'raken-2-asteron'],
  code: ['raken-1-pro', 'raken-1-ultra', 'raken-2-asteron'],
  work: ['raken-1-pro', 'raken-1-ultra', 'raken-2-asteron'],
  vidful: ['raken-1-vidful'],
};

// Weekly usage on the Free plan, in usage units. A unit is 1,000 tokens on a
// weight-1 model; bigger models use more units for the same tokens.
export const BASE_WEEKLY_UNITS = 500;

export const PLANS = {
  free: {
    name: 'Free',
    priceUsd: 0,
    limitMultiplier: 1,
    models: ['raken-1-flash', 'raken-1-standard'],
    tools: ['chat'],
  },
  plus: {
    name: 'Plus',
    priceUsd: 3,
    limitMultiplier: 3,
    models: ['raken-1-flash', 'raken-1-standard', 'raken-1-pro'],
    tools: ['chat', 'code', 'work'],
  },
  pro: {
    name: 'Pro',
    priceUsd: 20,
    limitMultiplier: 6,
    models: ['raken-1-flash', 'raken-1-standard', 'raken-1-pro', 'raken-1-ultra', 'raken-1-vidful'],
    tools: ['chat', 'code', 'work', 'vidful'],
  },
  ultra: {
    name: 'Ultra',
    priceUsd: 500,
    limitMultiplier: 30,
    models: Object.keys(MODELS),
    tools: Object.keys(TOOLS),
  },
};

// Credits cover usage after the weekly allowance runs out (1 credit = 1 unit).
// Ultra Credits run a task on the priority path: top quality, much faster.
export const PACKS = {
  'credits-200': { kind: 'credits', amount: 200, priceUsd: 2 },
  'credits-1000': { kind: 'credits', amount: 1000, priceUsd: 8 },
  'credits-5000': { kind: 'credits', amount: 5000, priceUsd: 35 },
  'ultra-5': { kind: 'ultraCredits', amount: 5, priceUsd: 5 },
  'ultra-25': { kind: 'ultraCredits', amount: 25, priceUsd: 20 },
  'ultra-100': { kind: 'ultraCredits', amount: 100, priceUsd: 70 },
};

export function weeklyUnits(planId) {
  return BASE_WEEKLY_UNITS * PLANS[planId].limitMultiplier;
}
