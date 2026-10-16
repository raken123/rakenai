import Stripe from 'stripe';
import { changePlan, grantMonthly, RakenError } from './credits.js';

// Stripe subscriptions for Raken Lite and Raken Plus. Needs STRIPE_SECRET_KEY,
// STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_LITE and STRIPE_PRICE_PLUS.

export function createBilling(db, env = process.env) {
  const prices = { lite: env.STRIPE_PRICE_LITE, plus: env.STRIPE_PRICE_PLUS };
  const configured = Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && prices.lite && prices.plus);
  const stripe = configured ? new Stripe(env.STRIPE_SECRET_KEY) : null;
  const planForPrice = (priceId) => Object.keys(prices).find((plan) => prices[plan] === priceId);
  const { data } = db;

  function requireStripe() {
    if (!stripe) throw new RakenError('billing_not_configured', 'Payments are not set up on this server yet.');
  }

  function userForCustomer(customerId) {
    return data.users[data.customerIndex[customerId]];
  }

  function applySubscription(user, subscription) {
    const active = ['active', 'trialing', 'past_due'].includes(subscription.status);
    const plan = active ? planForPrice(subscription.items.data[0]?.price.id) : null;
    user.subscriptionId = active ? subscription.id : null;
    changePlan(user.account, plan ?? 'free', { billedBySubscription: Boolean(plan) });
  }

  return {
    configured,

    async checkout(user, plan, origin) {
      requireStripe();
      if (!prices[plan]) throw new RakenError('bad_plan', 'Choose Raken Lite or Raken Plus.');
      if (user.subscriptionId) {
        throw new RakenError('has_subscription', 'You already have a subscription. Use Manage billing to change it.');
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: prices[plan], quantity: 1 }],
        client_reference_id: user.id,
        ...(user.stripeCustomerId ? { customer: user.stripeCustomerId } : { customer_email: user.email }),
        success_url: `${origin}/app.html?upgraded=1`,
        cancel_url: `${origin}/app.html`,
      });
      return session.url;
    },

    async portal(user, origin) {
      requireStripe();
      if (!user.stripeCustomerId) throw new RakenError('no_subscription', 'You do not have a paid plan yet.');
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${origin}/app.html`,
      });
      return session.url;
    },

    async webhook(rawBody, signature) {
      requireStripe();
      let event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
      } catch {
        throw new RakenError('bad_signature', 'Invalid webhook signature.');
      }

      const obj = event.data.object;
      switch (event.type) {
        case 'checkout.session.completed': {
          const user = data.users[obj.client_reference_id];
          if (!user || !obj.subscription) break;
          user.stripeCustomerId = obj.customer;
          data.customerIndex[obj.customer] = user.id;
          applySubscription(user, await stripe.subscriptions.retrieve(obj.subscription));
          break;
        }
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const user = userForCustomer(obj.customer);
          if (user) applySubscription(user, obj);
          break;
        }
        case 'invoice.paid': {
          const user = userForCustomer(obj.customer);
          if (user?.account.billedBySubscription) grantMonthly(user.account);
          break;
        }
      }
      db.save();
    },
  };
}
