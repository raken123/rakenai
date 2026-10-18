// Owner tool: put an account on a plan, and optionally add Credits or Ultra Credits.
// Usage: npm run set-plan -- someone@example.com pro [credits] [ultraCredits]
// Stop the server first so it does not overwrite the change.
import { PLANS } from '../src/catalog.js';
import { changePlan, newAccount, usageSummary } from '../src/usage.js';
import { openDb } from '../src/db.js';
import { createAuth } from '../src/auth.js';

const [email, plan, credits = '0', ultraCredits = '0'] = process.argv.slice(2);
if (!email || !PLANS[plan]) {
  console.error(`Usage: npm run set-plan -- <email> <${Object.keys(PLANS).join('|')}> [credits] [ultraCredits]`);
  process.exit(1);
}
const db = openDb();
const user = createAuth(db).findByEmail(email);
if (!user) {
  console.error(`No account for ${email}`);
  process.exit(1);
}
if (user.account.usedTokens === undefined) user.account = newAccount();
changePlan(user.account, plan);
user.account.credits += Number(credits);
user.account.ultraCredits += Number(ultraCredits);
db.flush();
const s = usageSummary(user.account);
console.log(`${user.email} is now on ${s.planName}: ${s.weeklyUnits} units/week, ${s.credits} Credits, ${s.ultraCredits} Ultra Credits.`);
