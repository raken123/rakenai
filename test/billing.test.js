import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Stripe from 'stripe';
import { openDb } from '../src/db.js';
import { createBilling } from '../src/billing.js';
import { newAccount, charge } from '../src/credits.js';

const env = {
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  STRIPE_PRICE_LITE: 'price_lite',
  STRIPE_PRICE_PLUS: 'price_plus',
};
const stripe = new Stripe('sk_test_x');

function signed(type, object) {
  const payload = JSON.stringify({ id: 'evt_1', object: 'event', type, data: { object } });
  return [Buffer.from(payload), stripe.webhooks.generateTestHeaderString({ payload, secret: env.STRIPE_WEBHOOK_SECRET })];
}

test('subscription webhooks change plans and refill credits', async () => {
  const db = openDb(mkdtempSync(join(tmpdir(), 'raken-')));
  const user = { id: 'u1', email: 'x@raken.ai', account: newAccount('free'), stripeCustomerId: 'cus_1' };
  db.data.users.u1 = user;
  db.data.customerIndex.cus_1 = 'u1';
  const billing = createBilling(db, env);
  assert.equal(billing.configured, true);

  const sub = (price, status = 'active') => ({ id: 'sub_1', customer: 'cus_1', status, items: { data: [{ price: { id: price } }] } });

  await billing.webhook(...signed('customer.subscription.updated', sub('price_lite')));
  assert.deepEqual([user.account.plan, user.account.credits, user.account.ultraCredits], ['lite', 300, 5]);
  assert.equal(user.subscriptionId, 'sub_1');

  charge(user.account, { tool: 'chat', modelId: 'raken-standard', prompt: 'hi' });
  assert.equal(user.account.credits, 299);
  await billing.webhook(...signed('invoice.paid', { customer: 'cus_1' }));
  assert.equal(user.account.credits, 300);

  await billing.webhook(...signed('customer.subscription.updated', sub('price_plus')));
  assert.deepEqual([user.account.plan, user.account.credits], ['plus', 50_000]);

  await billing.webhook(...signed('customer.subscription.deleted', sub('price_plus', 'canceled')));
  assert.equal(user.account.plan, 'free');
  assert.equal(user.subscriptionId, null);

  const [body] = signed('invoice.paid', { customer: 'cus_1' });
  await assert.rejects(billing.webhook(body, 't=1,v1=forged'), { code: 'bad_signature' });
});
