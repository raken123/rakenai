import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { newAccount, RakenError } from './usage.js';

const scryptAsync = promisify(scrypt);
const SESSION_DAYS = 30;

export const SESSION_COOKIE = 'raken_session';
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [, saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function createAuth(db) {
  const { data } = db;

  function startSession(userId) {
    const token = randomBytes(32).toString('base64url');
    data.sessions[token] = { userId, expires: Date.now() + SESSION_MAX_AGE * 1000 };
    db.save();
    return token;
  }

  return {
    async signup(email, password) {
      email = normalizeEmail(email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RakenError('bad_email', 'Enter a valid email address.');
      if (typeof password !== 'string' || password.length < 8) {
        throw new RakenError('weak_password', 'Use a password with at least 8 characters.');
      }
      if (data.emailIndex[email]) throw new RakenError('email_taken', 'An account with that email already exists.');

      const id = randomUUID();
      data.users[id] = {
        id,
        email,
        passwordHash: await hashPassword(password),
        createdAt: new Date().toISOString(),
        account: newAccount('free'),
      };
      data.emailIndex[email] = id;
      return { user: data.users[id], token: startSession(id) };
    },

    async login(email, password) {
      const user = data.users[data.emailIndex[normalizeEmail(email)]];
      if (!user || typeof password !== 'string' || !(await verifyPassword(password, user.passwordHash))) {
        throw new RakenError('bad_login', 'Wrong email or password.');
      }
      return { user, token: startSession(user.id) };
    },

    logout(token) {
      delete data.sessions[token];
      db.save();
    },

    userForToken(token) {
      const session = token && data.sessions[token];
      if (!session) return null;
      if (session.expires < Date.now()) {
        delete data.sessions[token];
        db.save();
        return null;
      }
      return data.users[session.userId] ?? null;
    },

    findByEmail(email) {
      return data.users[data.emailIndex[normalizeEmail(email)]] ?? null;
    },
  };
}
