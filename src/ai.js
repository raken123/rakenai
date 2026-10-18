import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { MODELS } from './catalog.js';
import { RakenError } from './usage.js';

// Each Raken model runs on a Claude model at a fixed effort level.
const ENGINES = {
  'raken-1-flash': { model: 'claude-haiku-5-5', effort: 'low' },
  'raken-1-standard': { model: 'claude-sonnet-5-5', effort: 'low' },
  'raken-1-pro': { model: 'claude-opus-5-5', effort: 'medium' },
  'raken-1-ultra': { model: 'claude-opus-5-5', effort: 'high' },
  'raken-2-asteron': { model: 'claude-fable-5-1', effort: 'xhigh' },
  'raken-1-vidful': { model: 'claude-opus-5-5', effort: 'high' },
};

// Ultra Credits buy the priority path: Claude Opus 5.5 at max effort in fast
// mode, which writes output up to 2.5x faster than the standard queue.
const ULTRA_ENGINE = { model: 'claude-opus-5-5', effort: 'max', speed: 'fast' };

// A quick, cheap read of how big a Code or Work task is, used to suggest Ultra Credits.
const ASSESS_ENGINE = { model: 'claude-haiku-5-5', effort: 'low' };

const SERVER_FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5']);

const chatSystem = (modelId) => `You are ${MODELS[modelId].name}, the assistant in the Raken app. Be helpful, direct \
and friendly. Use Markdown when it helps readability. You can write code in any language, from Python and \
JavaScript to esoteric ones like Brainfuck. If someone asks what technology Raken runs on, say that Raken's models \
are built on Anthropic's Claude models.`;

const fileSchema = z.object({
  path: z.string().describe('Relative file path such as index.html or src/main.py. No leading slash, no "..".'),
  content: z.string().describe('The complete file contents.'),
});

const AGENTS = {
  code: {
    schema: z.object({
      summary: z.string().describe('A short note telling the user what you built or changed and how to run it.'),
      files: z.array(fileSchema).describe('Every file in the project after your change, complete.'),
    }),
    instructions: `You are Raken Code, a coding agent. Build what the user asks for as a set of complete, working \
files. When the project already has files, apply the user's change and return the whole updated project.
- Any language is fine, including esoteric ones like Brainfuck (save Brainfuck as .bf; Raken can run it).
- For web apps, games, animations and coded images, prefer one self-contained index.html with inline CSS and JS. \
Raken shows it in a live preview. SVG files are previewed too.
- No placeholders, no "rest of the code here". Keep the summary short and say how to run the project.`,
  },
  work: {
    schema: z.object({
      summary: z.string().describe('A short note telling the user what you made or changed.'),
      files: z.array(fileSchema).describe('Every deliverable after your change, complete.'),
    }),
    instructions: `You are Raken Work, an agent that does knowledge work: documents, reports, plans, emails, slide \
decks, spreadsheets and research write-ups. When files already exist, apply the user's change and return all of them.
- Documents, emails and reports: Markdown (.md).
- Slide decks: one self-contained HTML file (16:9 slides, arrow keys and click to move between slides, clean design).
- Spreadsheets and tables of data: CSV (.csv).
- Write finished, polished work. No placeholders. Keep the summary short.`,
  },
  vidful: {
    schema: z.object({
      title: z.string(),
      svg: z.string().describe('A complete, standalone animated SVG document.'),
    }),
    instructions: `You are Raken 1 Vidful, a film and motion designer. Make a short movie (10-30 seconds, looping) \
as a standalone animated SVG (viewBox 0 0 1280 720) using SMIL <animate>, <animateTransform>, <animateMotion> and \
CSS keyframes. Tell a story in scenes with timed transitions, believable motion, lighting, depth and camera moves. \
Aim for a natural, cinematic look. No scripts, no external references. When a movie already exists, apply the \
user's change to it.`,
  },
};

const assessSchema = z.object({
  size: z.enum(['small', 'medium', 'large', 'huge']).describe('huge = would take a skilled person several days.'),
  estimate: z.string().describe('Rough time a skilled person would need, e.g. "about 3 days".'),
  reason: z.string().describe('One sentence on what makes it this size.'),
});

let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new RakenError('ai_not_configured', 'Raken is not connected to its AI service yet. Set ANTHROPIC_API_KEY on the server.');
  }
  return (client ??= new Anthropic());
}

function requestOptions(engine, maxTokens = 64000) {
  const params = {
    model: engine.model,
    max_tokens: maxTokens,
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

const engineFor = (modelId, ultra) => (ultra ? ULTRA_ENGINE : ENGINES[modelId]);

async function run(params, onText) {
  const api = getClient();
  try {
    return await stream(api, params, onText);
  } catch (err) {
    // Fast mode has its own rate limit; fall back to the standard queue.
    if (err instanceof Anthropic.RateLimitError && params.speed) {
      const { speed, ...rest } = params;
      try {
        return await stream(api, { ...rest, betas: rest.betas.filter((b) => b !== 'fast-mode-2026-02-01') }, onText);
      } catch (retryErr) {
        throw translate(retryErr);
      }
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

export function tokensUsed(message) {
  const u = message.usage ?? {};
  return {
    inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    outputTokens: u.output_tokens ?? 0,
  };
}

// Continues a chat. `history` is the stored list of API messages for this
// conversation (append-only); returns the assistant content to append.
export async function chat({ modelId, ultra, history, onText }) {
  const params = {
    ...requestOptions(engineFor(modelId, ultra)),
    cache_control: { type: 'ephemeral' },
    system: chatSystem(modelId),
    messages: history,
  };
  const message = await run(params, onText);
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { content: message.content, text, usage: tokensUsed(message) };
}

function projectBlock(files) {
  if (!files.length) return '';
  const parts = files.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`);
  return `Current files:\n${parts.join('\n')}\n\n`;
}

// Runs the Code, Work or Vidful agent. `turns` are the earlier requests and
// replies in this conversation; `files` is the current project.
export async function agent({ tool, modelId, ultra, turns, files, prompt, onProgress }) {
  const spec = AGENTS[tool];
  const messages = [
    ...turns.flatMap((t) => [{ role: 'user', content: t.prompt }, { role: 'assistant', content: t.reply }]),
    { role: 'user', content: `${projectBlock(files)}${prompt}` },
  ];
  const params = {
    ...requestOptions(engineFor(modelId, ultra), 128000),
    system: spec.instructions,
    messages,
  };
  params.output_config = { ...params.output_config, format: betaZodOutputFormat(spec.schema) };

  // Structured output streams as JSON; report each file as the agent starts writing it.
  let written = '';
  let lastPath = null;
  const onText = onProgress && ((text) => {
    written += text;
    const paths = [...written.matchAll(/"path"\s*:\s*"((?:[^"\\]|\\.)*)"/g)];
    const path = paths.at(-1)?.[1];
    if (path && path !== lastPath) {
      lastPath = path;
      onProgress(`Writing ${path}…`);
    }
  });

  const message = await run(params, onText);
  if (!message.parsed_output) {
    throw new RakenError('ai_error', `${MODELS[modelId].name} could not finish that. Try again or make the request smaller.`);
  }
  return { output: message.parsed_output, usage: tokensUsed(message) };
}

// Sizes up a Code or Work task. Returns null if the check itself fails, so a
// hiccup here never blocks the real request.
export async function assess(prompt) {
  try {
    const params = {
      ...requestOptions(ASSESS_ENGINE, 4000),
      system: 'Estimate how much work a task is. Judge the work requested, not how hard it sounds.',
      messages: [{ role: 'user', content: prompt }],
    };
    params.output_config = { ...params.output_config, format: betaZodOutputFormat(assessSchema) };
    const message = await run(params);
    return message.parsed_output ?? null;
  } catch (err) {
    if (err instanceof RakenError && err.code === 'ai_not_configured') throw err;
    return null;
  }
}
