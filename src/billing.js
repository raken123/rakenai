import { randomUUID } from 'node:crypto';
import { PACKS, PLANS } from './catalog.js';
import { addPack, changePlan, RakenError } from './usage.js';

// Demo payments: checkout succeeds instantly and no money moves. Every order
// is recorded on the account so it shows up in the billing history.

export function createBilling(db) {
  function record(user, order) {
    const entry = { id: randomUUID(), at: new Date().toISOString(), demo: true, ...order };
    (user.orders ??= []).unshift(entry);
    db.save();
    return entry;
  }

  return {
    subscribe(user, plan) {
      if (!PLANS[plan]) throw new RakenError('bad_plan', 'Choose Free, Plus, Pro or Ultra.');
      if (user.account.plan === plan) throw new RakenError('same_plan', `You're already on ${PLANS[plan].name}.`);
      changePlan(user.account, plan);
      return record(user, { item: `${PLANS[plan].name} plan`, priceUsd: PLANS[plan].priceUsd, period: 'month' });
    },

    buyPack(user, packId) {
      const pack = PACKS[packId];
      if (!pack) throw new RakenError('bad_pack', 'That pack does not exist.');
      addPack(user.account, packId);
      const label = pack.kind === 'credits' ? 'Credits' : 'Ultra Credits';
      return record(user, { item: `${pack.amount.toLocaleString('en-US')} ${label}`, priceUsd: pack.priceUsd });
    },
  };
}
