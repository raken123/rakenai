// Shared plan card used by the landing page and the in-app plans dialog.
export function planCard(catalog, id, plan, { current = false, action }) {
  const { models, tools } = catalog;
  const card = document.createElement('div');
  card.className = `card plan${id === 'plus' ? ' featured' : ''}${current ? ' current' : ''}`;

  const allowance = plan.dailyCredits
    ? `${plan.dailyCredits} credits every day you log in`
    : `${plan.monthlyCredits.toLocaleString()} credits / month`;
  const items = [
    allowance,
    `${plan.monthlyUltraCredits} Ultra Credits / month`,
    `Models: ${plan.models.map((m) => models[m].name).join(', ')}`,
    `Tools: ${plan.tools.map((t) => tools[t].name).join(', ')}`,
  ];

  const h3 = document.createElement('h3');
  h3.textContent = plan.name;
  const price = document.createElement('div');
  price.className = 'price';
  price.textContent = plan.priceUsd ? `$${plan.priceUsd}/mo` : 'Free';
  const ul = document.createElement('ul');
  for (const text of items) ul.append(Object.assign(document.createElement('li'), { textContent: text }));
  card.append(h3, price, ul);

  if (action) {
    const el = document.createElement(action.href ? 'a' : 'button');
    el.className = 'button';
    el.textContent = action.label;
    if (action.href) el.href = action.href;
    if (action.onClick) el.addEventListener('click', action.onClick);
    if (action.disabled) el.disabled = true;
    card.append(el);
  }
  return card;
}
