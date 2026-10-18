import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Small JSON-file database. Everything lives in memory and is flushed to disk
// shortly after each change (write to a temp file, then rename, so a crash
// never leaves a half-written file behind).

const EMPTY = { users: {}, sessions: {}, conversations: {}, emailIndex: {} };

export function openDb(dir = process.env.RAKEN_DATA_DIR ?? join(process.cwd(), 'data')) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'raken-db.json');
  let data;
  try {
    data = { ...EMPTY, ...JSON.parse(readFileSync(file, 'utf8')) };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    data = structuredClone(EMPTY);
  }

  let timer = null;
  const flush = () => {
    timer = null;
    writeFileSync(`${file}.tmp`, JSON.stringify(data));
    renameSync(`${file}.tmp`, file);
  };

  return {
    data,
    save() {
      timer ??= setTimeout(flush, 50);
    },
    flush() {
      if (timer) clearTimeout(timer);
      flush();
    },
  };
}
