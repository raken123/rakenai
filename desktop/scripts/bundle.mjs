// Copies the Raken server and web app into desktop/app so the Mac app can run
// it, and writes config.json. Set RAKEN_SERVER_URL to make the app open your
// hosted Raken instead of running the server on the Mac.
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const desktop = join(import.meta.dirname, '..');
const root = join(desktop, '..');
const app = join(desktop, 'app');

rmSync(app, { recursive: true, force: true });
for (const entry of ['server.js', 'src', 'web']) {
  cpSync(join(root, entry), join(app, entry), { recursive: true });
}

const serverUrl = process.env.RAKEN_SERVER_URL?.trim() || null;
writeFileSync(join(desktop, 'config.json'), JSON.stringify({ serverUrl }, null, 2) + '\n');
console.log(`Bundled Raken server into desktop/app (${serverUrl ? `opens ${serverUrl}` : 'runs locally'}).`);
