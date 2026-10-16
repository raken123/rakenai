import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { MODELS } from './catalog.js';
import { RakenError } from './credits.js';

// Each Raken model runs on a Claude model at a fixed effort level. Raken Mini
// and Standard trade depth for speed; Plus and Astryx think harder.
const ENGINES = {
  'raken-mini': { model: 'claude-haiku-5-5', effort: 'low' },
  'raken-standard': { model: 'claude-sonnet-5-5', effort: 'low' },
  'raken-plus': { model: 'claude-opus-5-5', effort: 'medium' },
  'raken-astryx': { model: 'claude-opus-5-5', effort: 'high' },
  'raken-imge-1': { model: 'claude-opus-5-5', effort: 'medium' },
  'raken-vidful-1': { model: 'claude-opus-5-5', effort: 'high' },
  'raken-mesh-1': { model: 'claude-opus-5-5', effort: 'high' },
};

// Ultra Credits buy the priority path: Claude Opus 5.5 in fast mode, which
// generates output up to 2.5x faster than the standard queue.
const ULTRA_ENGINE = { model: 'claude-opus-5-5', effort: 'high', speed: 'fast' };

const SERVER_FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

const SYSTEM = `You are Raken, the assistant inside the Raken app. Be helpful, direct and friendly. \
Format answers with Markdown when it helps readability.`;

const OUTPUTS = {
  work: {
    schema: z.object({
      summary: z.string().describe('One or two sentences telling the user what you made.'),
      files: z
        .array(z.object({ name: z.string().describe('File name with extension, no folders.'), content: z.string() }))
        .describe('The complete files, ready to save.'),
    }),
    instructions: `You are Raken Work, an agent that makes files for the user. Produce every file the request needs, \
complete and ready to use (no placeholders or "rest of code here"). Choose sensible file names and formats.`,
  },
  image: {
    schema: z.object({
      title: z.string(),
      svg: z.string().describe('A complete, standalone SVG document.'),
    }),
    instructions: `You are Raken Imge 1, an illustrator. Create a detailed, great looking image as a standalone SVG \
(viewBox 0 0 1024 1024, gradients, layered shapes, lighting). No scripts, no external references.`,
  },
  video: {
    schema: z.object({
      title: z.string(),
      svg: z.string().describe('A complete, standalone animated SVG document.'),
    }),
    instructions: `You are Raken Vidful 1, a motion designer. Create a short movie (8-20 seconds, looping) as a \
standalone animated SVG (viewBox 0 0 1280 720) using SMIL <animate>/<animateTransform>/<animateMotion> and CSS \
keyframes. Tell the story in scenes with timed transitions. No scripts, no external references.`,
  },
  mesh: {
    schema: z.object({
      title: z.string(),
      obj: z.string().describe('A Wavefront OBJ file: v, vn and f lines.'),
    }),
    instructions: `You are Raken Mesh 1, a 3D modeler. Build the requested model as a Wavefront OBJ mesh. Use enough \
vertices for smooth, recognizable shapes, consistent counter-clockwise winding, vertex normals, and centre the model \
at the origin about 2 units tall. Output only geometry (no materials file).`,
  },
};

let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new RakenError('ai_not_configured', 'Raken is not connected to its AI service yet. Set ANTHROPIC_API_KEY on the server.');
  }
  return (client ??= new Anthropic());
}

function requestOptions(modelId, ultra) {
  const engine = ultra ? ULTRA_ENGINE : ENGINES[modelId];
  const params = {
    model: engine.model,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    output_config: { effort: engine.effort },
    betas: [],
  };
  if (engine.speed) {
    params.speed = engine.speed;
    params.betas.push('fast-mode-2026-02-01');
  } else if (SERVER_FALLBACK_MODELS.has(engine.model)) {
    // If a safety classifier declines, retry server-side on the recommended model.
    params.fallbacks = 'default';
    params.betas.push('server-side-fallback-2026-07-01');
  }
  return params;
}

async function run(params, onText) {
  const api = getClient();
  try {
    return await stream(api, params, onText);
  } catch (err) {
    // Fast mode has its own rate limit; fall back to the standard queue.
    if (err instanceof Anthropic.RateLimitError && params.speed) {
      const { speed, ...rest } = params;
      return stream(api, { ...rest, betas: rest.betas.filter((b) => b !== 'fast-mode-2026-02-01') }, onText);
    }
    throw translate(err);
  }
}

async function stream(api, params, onText) {
  const s = api.beta.messages.stream(params);
  if (onText) s.on('text', onText);
  const message = await s.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new RakenError('refused', "Raken can't help with that request.");
  }
  return message;
}

function translate(err) {
  if (err instanceof RakenError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new RakenError('ai_not_configured', 'The AI service rejected the server API key.');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new RakenError('busy', 'Raken is very busy right now. Try again in a moment.');
  }
  if (err instanceof Anthropic.APIError) {
    console.error('AI service error', err.status, err.message);
    return new RakenError('ai_error', 'The AI service had a problem. Try again.');
  }
  return err;
}

// Continues a chat. `history` is the stored list of API messages for this
// conversation (append-only); returns the assistant content to append.
export async function chat({ modelId, ultra, history, onText }) {
  const params = { ...requestOptions(modelId, ultra), system: SYSTEM, messages: history };
  const message = await run(params, onText);
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { content: message.content, text };
}

// One-shot generation for Work, Imge, Vidful and Mesh.
export async function create({ kind, modelId, ultra, prompt }) {
  const output = OUTPUTS[kind];
  const params = {
    ...requestOptions(modelId, ultra),
    system: output.instructions,
    messages: [{ role: 'user', content: prompt }],
  };
  params.output_config = { ...params.output_config, format: betaZodOutputFormat(output.schema) };
  const message = await run(params);
  if (!message.parsed_output) {
    throw new RakenError('ai_error', `${MODELS[modelId].name} could not finish that. Try a simpler prompt.`);
  }
  return message.parsed_output;
}

export function outputKind(tool, modelId) {
  if (tool === 'work') return 'work';
  const kind = MODELS[modelId].kind;
  return kind === 'text' ? null : kind;
}
