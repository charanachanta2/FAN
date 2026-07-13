'use strict';

const { neon } = require('@neondatabase/serverless');
const { ENV, FEATURES, disableFeature } = require('../config/env');

let sql = null;
if (FEATURES.db) {
  try {
    sql = neon(ENV.DATABASE_URL);
  } catch (err) {
    // A malformed DATABASE_URL must never crash the whole serverless function
    // (that would take down routes that have nothing to do with the DB).
    // eslint-disable-next-line no-console
    console.error('[stadium-copilot] Failed to initialize Neon client — DB features disabled:', err.message);
    disableFeature('db');
    disableFeature('auth');
  }
}

let dbReadyPromise = null;

/**
 * Idempotently creates the schema on first use, then caches the readiness
 * promise for subsequent calls (safe to call on every cold start / request).
 */
function ensureDb() {
  if (!FEATURES.db) return Promise.resolve(false);
  if (dbReadyPromise) return dbReadyPromise;
  dbReadyPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'fan',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS incidents (
        id SERIAL PRIMARY KEY,
        zone TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT,
        recommended_action TEXT,
        reported_by TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS chat_logs (
        id SERIAL PRIMARY KEY,
        language TEXT,
        message TEXT NOT NULL,
        reply TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;
    return true;
  })();
  return dbReadyPromise;
}

module.exports = {
  /** The tagged-template SQL client (`null` if DB isn't configured). */
  get sql() { return sql; },
  ensureDb,
};
