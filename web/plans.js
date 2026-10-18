// Shared plan and pack cards used by the landing page and the in-app billing dialog.
import { el } from './files.js';

const RANK = ['free', 'plus', 'pro', 'ultra'];

export function planFeatures(catalog, id) {
  const plan = catalog.plans[id];
  const { models, tools } = catalog;
  const limit = plan.limitMultiplier === 1 ? 'Standard weekly usage' : `${plan.limitMultiplier}x the Free weekly usage`;
  return [
    limit,
    `Tools: ${plan.tools.map((t) => tools[t].name).join(', ')}`,
    `Models: ${plan.models.map((m) => models[m].name).join(', ')}`,
  ];
}

export function planCard(catalog, id, { current = false, action } = {}) {
  const plan = catalog.plans[id];
  const card = el('div', { className: `card plan${current ? ' current' : ''}` },
    el('span', { className: 'tag', textContent: current ? 'Your plan' : ' ' }),
    el('h3', { textContent: plan.name }),
    el('div', { className: 'price' }, plan.priceUsd ? `$${plan.priceUsd}` : '$0', el('small', { textContent: ' / month' })),
    el('ul', {}, ...planFeatures(catalog, id).map((text) => el('li', { textContent: text }))),
  );
  if (action) card.append(actionButton(action));
  return card;
}

export function packCard(catalog, id, { action } = {}) {
  const pack = catalog.packs[id];
  const label = pack.kind === 'credits' ? 'Credits' : 'Ultra Credits';
  return el('div', { className: 'card pack' },
    el('div', {}, el('strong', { textContent: `${pack.amount.toLocaleString()} ${label}` }), el('div', { className: 'muted', textContent: `$${pack.priceUsd}` })),
    action && actionButton(action),
  );
}

function actionButton({ label, href, onClick, disabled, ghost }) {
  const node = el(href ? 'a' : 'button', { className: `button${ghost ? ' ghost' : ''}`, textContent: label });
  if (href) node.href = href;
  else node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  if (disabled) node.disabled = true;
  return node;
}

export const isUpgrade = (from, to) => RANK.indexOf(to) > RANK.indexOf(from);

// The cheapest plan that unlocks a tool or model.
export function planFor(catalog, { tool, model }) {
  return RANK.find((id) => (tool ? catalog.plans[id].tools.includes(tool) : catalog.plans[id].models.includes(model)));
}
