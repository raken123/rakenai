// Single source of truth for Raken's models, tools and plans.

export const MODELS = {
  'raken-mini': {
    name: 'Raken Mini',
    kind: 'text',
    description: 'Very fast, no thinking required.',
    creditMultiplier: 1,
    thinking: false,
  },
  'raken-standard': {
    name: 'Raken Standard',
    kind: 'text',
    description: 'Normal AI. The base model.',
    creditMultiplier: 1,
    thinking: false,
  },
  'raken-plus': {
    name: 'Raken Plus',
    kind: 'text',
    description: 'Smarter and a bit slower.',
    creditMultiplier: 3,
    thinking: true,
  },
  'raken-astryx': {
    name: 'Raken Astryx',
    kind: 'text',
    description: 'Very smart. Made for agents.',
    creditMultiplier: 8,
    thinking: true,
  },
  'raken-imge-1': {
    name: 'Raken Imge 1',
    kind: 'image',
    description: 'Makes great looking images.',
    creditMultiplier: 10,
  },
  'raken-vidful-1': {
    name: 'Raken Vidful 1',
    kind: 'video',
    description: 'Creates short movies.',
    creditMultiplier: 40,
  },
  'raken-mesh-1': {
    name: 'Raken Mesh 1',
    kind: 'mesh',
    description: 'Generates 3D models in 8K quality.',
    creditMultiplier: 25,
  },
};

export const TOOLS = {
  chat: { name: 'Chat', description: 'Talk with Raken like any AI app.' },
  work: { name: 'Work', description: 'AI agents make files for you.' },
  vidful: { name: 'Vidful', description: 'Turn a prompt into a short movie.' },
};

// Which models each tool can run on.
export const TOOL_MODELS = {
  chat: ['raken-mini', 'raken-standard', 'raken-plus', 'raken-astryx', 'raken-imge-1', 'raken-mesh-1'],
  work: ['raken-standard', 'raken-plus', 'raken-astryx'],
  vidful: ['raken-vidful-1'],
};

export const PLANS = {
  free: {
    name: 'Raken Free',
    priceUsd: 0,
    // Free credits are a daily allowance, topped back up to this amount on the
    // first login of each UTC day (they do not stack).
    dailyCredits: 10,
    monthlyCredits: 0,
    monthlyUltraCredits: 0,
    models: ['raken-standard'],
    tools: ['chat'],
  },
  lite: {
    name: 'Raken Lite',
    priceUsd: 3,
    dailyCredits: 0,
    monthlyCredits: 300,
    monthlyUltraCredits: 5,
    models: ['raken-mini', 'raken-standard', 'raken-plus', 'raken-vidful-1'],
    tools: ['chat', 'vidful'],
  },
  plus: {
    name: 'Raken Plus',
    priceUsd: 30,
    dailyCredits: 0,
    monthlyCredits: 50_000,
    monthlyUltraCredits: 70,
    models: Object.keys(MODELS),
    tools: Object.keys(TOOLS),
  },
};

// Every model is trained in the cloud for somewhere in this range of epochs.
export const TRAINING_EPOCHS = { min: 150, max: 2400 };
