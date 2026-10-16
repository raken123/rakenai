// Owner tool: give an account a plan without going through Stripe.
// Usage: npm run set-plan -- someone@example.com plus
// Stop the server first so it does not overwrite the change.
import { PLANS } from '../src/catalog.js';
import { changePlan } from '../src/credits.js';
import { openDb } from '../src/db.js';
import { createAuth } from '../src/auth.js';

const [email, plan] = process.argv.slice(2);
if (!email || !PLANS[plan]) {
  console.error(`Usage: npm run set-plan -- <email> <${Object.keys(PLANS).join('|')}>`);
  process.exit(1);
}
const db = openDb();
const user = createAuth(db).findByEmail(email);
if (!user) {
  console.error(`No account for ${email}`);
  process.exit(1);
}
changePlan(user.account, plan);
db.flush();
console.log(`${user.email} is now on ${PLANS[plan].name}: ${user.account.credits} credits, ${user.account.ultraCredits} Ultra Credits.`);
