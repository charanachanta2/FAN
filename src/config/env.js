'use strict';

/**
 * ----------------------------------------------------------------------------
 * CONFIG & ENV VALIDATION
 * ----------------------------------------------------------------------------
 * Single source of truth for environment configuration. Every other module
 * reads config through `ENV` / `FEATURES` from here instead of touching
 * `process.env` directly, so there is exactly one place that defines what
 * variables exist and what happens when they're missing.
 */

const ENV = {
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || '',
  GOOGLE_TRANSLATE_API_KEY: process.env.GOOGLE_TRANSLATE_API_KEY || '',
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '',
  NODE_ENV: process.env.NODE_ENV || 'production',
  // Shared secret staff must provide to self-register a 'staff' account. If
  // unset, staff self-signup is disabled entirely (fans can still sign up)
  // and staff accounts must be provisioned another way (e.g. directly in the
  // DB or via an admin). This closes the "anyone can grant themselves staff
  // privileges" gap that a bare role field in a public signup form creates.
  STAFF_SIGNUP_CODE: process.env.STAFF_SIGNUP_CODE || '',
  // Neon Auth / Stack Auth (optional — see integration point in middleware/auth.js)
  STACK_PROJECT_ID: process.env.STACK_PROJECT_ID || '',
  STACK_PUBLISHABLE_CLIENT_KEY: process.env.STACK_PUBLISHABLE_CLIENT_KEY || '',
  STACK_SECRET_SERVER_KEY: process.env.STACK_SECRET_SERVER_KEY || '',
};

/** Derived capability flags — every route checks these instead of re-deriving them. */
const FEATURES = {
  db: Boolean(ENV.DATABASE_URL),
  auth: Boolean(ENV.DATABASE_URL && ENV.JWT_SECRET),
  gemini: Boolean(ENV.GEMINI_API_KEY),
  maps: Boolean(ENV.GOOGLE_MAPS_API_KEY),
  translate: Boolean(ENV.GOOGLE_TRANSLATE_API_KEY),
};

/** Logs (once, at boot) which required env vars are missing, without throwing. */
function warnMissing() {
  const missing = [];
  if (!ENV.DATABASE_URL) missing.push('DATABASE_URL');
  if (!ENV.JWT_SECRET) missing.push('JWT_SECRET');
  if (!ENV.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[stadium-copilot] Missing env vars: ${missing.join(', ')}. ` +
        'Related features will run in degraded/demo mode. Set these in Vercel env settings.'
    );
  }
}

/** Disables a feature flag at runtime (e.g. when DB init fails after boot). */
function disableFeature(name) {
  FEATURES[name] = false;
}

module.exports = { ENV, FEATURES, warnMissing, disableFeature };
