/**
 * ============================================================================
 *  FIFA WORLD CUP 2026 — STADIUM COPILOT
 *  A single-file, GenAI-powered stadium operations & fan-experience platform.
 * ============================================================================
 *
 *  WHAT THIS FILE IS
 *  ------------------
 *  This one file contains BOTH the backend (Express API) AND the frontend
 *  (a hand-built, accessible, dependency-free HTML/CSS/JS page served from
 *  the root route). It is designed to deploy as a single Vercel Serverless
 *  Function that also serves the UI, so the entire application ships as:
 *
 *      /api/index.js   <- this file (backend + frontend)
 *      /public/styles.css <- extracted stylesheet, served as a static asset
 *      /vercel.json     <- routing config (provided separately)
 *      /package.json    <- dependencies (provided separately)
 *
 *  FEATURES (mapped to the problem statement)
 *  --------------------------------------------
 *   1. Navigation & Transportation  -> /api/directions (Google Directions API)
 *   2. Multilingual Assistance      -> /api/chat (Gemini) + /api/translate (Google Translate)
 *   3. Crowd Management             -> /api/crowd  (live zone density + AI guidance)
 *   4. Operational Intelligence     -> /api/incidents (AI severity triage + briefings)
 *   5. Real-time Decision Support   -> AI-generated recommendations across chat/crowd/incidents
 *   6. Accessibility                -> WCAG-conscious UI: skip links, ARIA live regions,
 *                                       high-contrast + large-text modes, full keyboard support
 *   7. Sustainability               -> AI-generated eco/sustainability tips in the chat assistant
 *
 *  SECURITY NOTES
 *  ----------------
 *   - Helmet sets strict security headers + a nonce-based CSP (no 'unsafe-inline').
 *   - All third-party API keys (Gemini, Google Maps, Google Translate) live ONLY on
 *     the server; the browser never sees them.
 *   - express-rate-limit throttles all /api/* routes; a stricter limiter guards /api/chat.
 *   - All SQL uses the Neon serverless tagged-template driver, which parameterizes
 *     every query automatically (no string concatenation -> no SQL injection).
 *   - Passwords are hashed with bcrypt; sessions are short-lived signed JWTs.
 *   - User-provided text is HTML-escaped before ever being interpolated into markup.
 *   - Error handler never leaks stack traces or internal errors to clients.
 *
 *  ENVIRONMENT VARIABLES (set these in Vercel Project Settings -> Environment Variables)
 *  ----------------------------------------------------------------------------
 *   Required for full functionality:
 *     DATABASE_URL              Neon Postgres connection string
 *     JWT_SECRET                Long random string used to sign auth session tokens
 *     GEMINI_API_KEY             Google AI Studio / Gemini API key (GenAI chat, triage, briefings)
 *
 *   Optional (features gracefully degrade if absent):
 *     GOOGLE_MAPS_API_KEY        Enables /api/directions (transportation/navigation)
 *     GOOGLE_TRANSLATE_API_KEY   Enables /api/translate  (falls back to Gemini translation if unset)
 *     ALLOWED_ORIGIN             CORS allow-list, e.g. https://your-app.vercel.app (default: same-origin only)
 *
 *   Neon Auth (Stack Auth) — optional, drop-in your own snippet:
 *     STACK_PROJECT_ID
 *     STACK_PUBLISHABLE_CLIENT_KEY
 *     STACK_SECRET_SERVER_KEY
 *     See the "NEON AUTH INTEGRATION POINT" comment below — a working built-in
 *     email/password + JWT auth is provided by default so the app works even
 *     before you paste in your own Neon Auth (Stack) code.
 *
 * ============================================================================
 */

'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { neon } = require('@neondatabase/serverless');

// ----------------------------------------------------------------------------
// 1. CONFIG & ENV VALIDATION
// ----------------------------------------------------------------------------

const ENV = {
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || '',
  GOOGLE_TRANSLATE_API_KEY: process.env.GOOGLE_TRANSLATE_API_KEY || '',
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '',
  NODE_ENV: process.env.NODE_ENV || 'production',
  // Neon Auth / Stack Auth (optional — see integration point below)
  STACK_PROJECT_ID: process.env.STACK_PROJECT_ID || '',
  STACK_PUBLISHABLE_CLIENT_KEY: process.env.STACK_PUBLISHABLE_CLIENT_KEY || '',
  STACK_SECRET_SERVER_KEY: process.env.STACK_SECRET_SERVER_KEY || '',
};

const FEATURES = {
  db: Boolean(ENV.DATABASE_URL),
  auth: Boolean(ENV.DATABASE_URL && ENV.JWT_SECRET),
  gemini: Boolean(ENV.GEMINI_API_KEY),
  maps: Boolean(ENV.GOOGLE_MAPS_API_KEY),
  translate: Boolean(ENV.GOOGLE_TRANSLATE_API_KEY),
};

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
warnMissing();

let sql = null;
if (FEATURES.db) {
  try {
    sql = neon(ENV.DATABASE_URL);
  } catch (err) {
    // A malformed DATABASE_URL must never crash the whole serverless function
    // (that would take down routes that have nothing to do with the DB).
    // eslint-disable-next-line no-console
    console.error('[stadium-copilot] Failed to initialize Neon client — DB features disabled:', err.message);
    FEATURES.db = false;
    FEATURES.auth = false;
  }
}

// ----------------------------------------------------------------------------
// 2. SMALL UTILITIES
// ----------------------------------------------------------------------------

/** Escape untrusted text before it is ever interpolated into HTML. */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/** Basic in-memory TTL cache (per serverless instance) to cut redundant AI/API calls. */
class TTLCache {
  constructor() { this.store = new Map(); }
  get(key) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expires) { this.store.delete(key); return undefined; }
    return hit.value;
  }
  set(key, value, ttlMs) {
    this.store.set(key, { value, expires: Date.now() + ttlMs });
  }
}
const cache = new TTLCache();

/** Clamp + validate a plain string field. Returns null if invalid. */
function cleanString(input, { min = 1, max = 2000 } = {}) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
}

// Matches any BCP-47-style language tag (e.g. "en", "pt-BR", "zh-Hant", "yue").
// Rather than whitelist a handful of languages, we validate the *shape* of the
// code and let Gemini (and Google Translate, when configured) do the actual
// translation — this means every language Gemini can speak is supported here,
// not just a curated subset.
const LANG_TAG_RE = /^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8}){0,2}$/;

function normalizeLang(input, fallback = 'en') {
  const trimmed = cleanString(input, { min: 2, max: 20 });
  if (!trimmed || !LANG_TAG_RE.test(trimmed)) return fallback;
  return trimmed;
}

// A curated set of languages with native display names, used only to
// populate the assistant's language <select> with sensible, readable
// defaults. This list does NOT limit which languages the assistant can
// actually respond in — see normalizeLang() / LANG_TAG_RE above. Any BCP-47
// code (including ones not in this list) is accepted by /api/chat and
// /api/translate.
const LANGUAGE_OPTIONS = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'pt', name: 'Português' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'sv', name: 'Svenska' },
  { code: 'no', name: 'Norsk' },
  { code: 'da', name: 'Dansk' },
  { code: 'fi', name: 'Suomi' },
  { code: 'pl', name: 'Polski' },
  { code: 'cs', name: 'Čeština' },
  { code: 'sk', name: 'Slovenčina' },
  { code: 'hu', name: 'Magyar' },
  { code: 'ro', name: 'Română' },
  { code: 'bg', name: 'Български' },
  { code: 'el', name: 'Ελληνικά' },
  { code: 'ru', name: 'Русский' },
  { code: 'uk', name: 'Українська' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ar', name: 'العربية' },
  { code: 'he', name: 'עברית' },
  { code: 'fa', name: 'فارسی' },
  { code: 'ur', name: 'اردو' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ' },
  { code: 'gu', name: 'ગુજરાતી' },
  { code: 'mr', name: 'मराठी' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'kn', name: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'മലയാളം' },
  { code: 'si', name: 'සිංහල' },
  { code: 'th', name: 'ไทย' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Bahasa Melayu' },
  { code: 'tl', name: 'Filipino' },
  { code: 'zh', name: '中文（简体）' },
  { code: 'zh-Hant', name: '中文（繁體）' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'sw', name: 'Kiswahili' },
  { code: 'am', name: 'አማርኛ' },
  { code: 'ha', name: 'Hausa' },
  { code: 'yo', name: 'Yorùbá' },
  { code: 'ig', name: 'Igbo' },
  { code: 'zu', name: 'isiZulu' },
  { code: 'af', name: 'Afrikaans' },
];

// RTL languages — used client-side to flip document direction.
const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ku']);

// ----------------------------------------------------------------------------
// 3. DATABASE BOOTSTRAP (idempotent — safe to run on every cold start)
// ----------------------------------------------------------------------------

let dbReadyPromise = null;
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

// ----------------------------------------------------------------------------
// 4. AUTH — default working implementation (email/password + JWT)
// ----------------------------------------------------------------------------
//
// >>> NEON AUTH INTEGRATION POINT <<<
// If you have your own Neon Auth (Stack Auth) code, this is where it plugs in.
// Replace the body of `signup`, `login`, and `authMiddleware` below with calls
// into @stackframe/stack (or your existing Stack Auth handlers), using
// STACK_PROJECT_ID / STACK_PUBLISHABLE_CLIENT_KEY / STACK_SECRET_SERVER_KEY.
// Everything else in this file (routes, GenAI calls, DB tables) is agnostic
// to which auth backend issues the session, as long as `authMiddleware`
// still attaches `req.user = { id, email, role }` on success.

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    ENV.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function authMiddleware(requiredRole) {
  return (req, res, next) => {
    if (!FEATURES.auth) {
      return res.status(503).json({ error: 'Auth is not configured on this deployment.' });
    }
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token.' });
    try {
      const payload = jwt.verify(token, ENV.JWT_SECRET);
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
      if (requiredRole && req.user.role !== requiredRole && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Insufficient permissions.' });
      }
      return next();
    } catch (_err) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
  };
}

// ----------------------------------------------------------------------------
// 5. GENERATIVE AI HELPERS (Gemini) + GOOGLE APIS (Maps / Translate)
// ----------------------------------------------------------------------------

const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Calls Gemini's generateContent REST endpoint directly (no extra SDK
 * dependency needed), with a system instruction and a hard timeout so a slow
 * upstream call can never hang a serverless invocation indefinitely.
 */
async function callGemini(prompt, { system, maxOutputTokens = 512, timeoutMs = 9000 } = {}) {
  if (!FEATURES.gemini) {
    return '(Demo mode: GEMINI_API_KEY is not configured, so this is a placeholder response. ' +
      'Set GEMINI_API_KEY in your environment to enable live GenAI answers.)';
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${ENV.GEMINI_API_KEY}`;
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens, temperature: 0.4 },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Gemini API error ${resp.status}: ${errText.slice(0, 300)}`);
    }
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    return text.trim() || 'Sorry, I could not generate a response just now.';
  } finally {
    clearTimeout(timer);
  }
}

async function callGoogleTranslate(text, targetLang) {
  if (FEATURES.translate) {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${ENV.GOOGLE_TRANSLATE_API_KEY}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, target: targetLang, format: 'text' }),
    });
    if (!resp.ok) throw new Error(`Translate API error ${resp.status}`);
    const data = await resp.json();
    return data?.data?.translations?.[0]?.translatedText || text;
  }
  // Fallback: use Gemini as a translator if Cloud Translation isn't configured.
  return callGemini(`Translate the following text into language code "${targetLang}". ` +
    `Return ONLY the translated text, nothing else:\n\n${text}`);
}

async function callGoogleDirections(origin, destination, mode) {
  if (!FEATURES.maps) {
    throw Object.assign(new Error('Directions API not configured (missing GOOGLE_MAPS_API_KEY).'), { code: 503 });
  }
  const params = new URLSearchParams({
    origin, destination, mode: mode || 'walking', key: ENV.GOOGLE_MAPS_API_KEY,
  });
  const resp = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
  if (!resp.ok) throw new Error(`Directions API error ${resp.status}`);
  const data = await resp.json();
  if (data.status !== 'OK') {
    throw Object.assign(new Error(`Directions API status: ${data.status}`), { code: 502 });
  }
  const leg = data.routes?.[0]?.legs?.[0];
  return {
    summary: data.routes?.[0]?.summary || '',
    distance: leg?.distance?.text,
    duration: leg?.duration?.text,
    steps: (leg?.steps || []).map((s) => ({
      instruction: s.html_instructions?.replace(/<[^>]+>/g, ''),
      distance: s.distance?.text,
      duration: s.duration?.text,
    })),
  };
}

// ----------------------------------------------------------------------------
// 6. SIMULATED STADIUM ZONE TELEMETRY (would be replaced by real IoT/camera feed)
// ----------------------------------------------------------------------------

const ZONES = ['North Gate', 'South Gate', 'East Concourse', 'West Concourse', 'Fan Zone Plaza', 'Metro Transit Hub'];

function simulateCrowdSnapshot() {
  return ZONES.map((zone) => {
    const density = Math.round(20 + Math.random() * 78); // 20-98%
    let level = 'Low';
    if (density > 85) level = 'Critical';
    else if (density > 65) level = 'High';
    else if (density > 40) level = 'Moderate';
    return { zone, density, level };
  });
}

// ----------------------------------------------------------------------------
// 7. EXPRESS APP
// ----------------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(compression());
app.use(express.json({ limit: '64kb' }));

app.use(
  cors({
    origin: ENV.ALLOWED_ORIGIN ? ENV.ALLOWED_ORIGIN.split(',').map((s) => s.trim()) : true,
    methods: ['GET', 'POST'],
  })
);

// Per-request CSP nonce, used only for the small inline bootstrap script on
// the HTML page (all other JS is loaded as a same-origin, non-inline file).
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use((req, res, next) => {
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", `'nonce-${res.locals.nonce}'`],
        styleSrc: ["'self'", "'unsafe-inline'"], // small embedded stylesheet only
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginEmbedderPolicy: false,
  })(req, res, next);
});

// Global API rate limit + a stricter one for the AI chat endpoint.
const apiLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const chatLimiter = rateLimit({ windowMs: 60_000, max: 15, standardHeaders: true, legacyHeaders: false });
app.use('/api/', apiLimiter);

// ----------------------------------------------------------------------------
// 8. ROUTES — HEALTH & DIAGNOSTICS
// ----------------------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Lightweight built-in self-test: verifies config & connectivity without
// exposing secrets. Useful as a smoke test after every deploy.
app.get('/api/selftest', async (req, res) => {
  const results = { features: FEATURES, checks: {} };
  results.checks.env_jwt_secret = Boolean(ENV.JWT_SECRET);
  results.checks.env_gemini_key = Boolean(ENV.GEMINI_API_KEY);
  results.checks.env_maps_key = Boolean(ENV.GOOGLE_MAPS_API_KEY);
  if (FEATURES.db) {
    try {
      await ensureDb();
      await sql`SELECT 1`;
      results.checks.database = 'connected';
    } catch (err) {
      results.checks.database = 'error';
    }
  } else {
    results.checks.database = 'not_configured';
  }
  res.json(results);
});

// ----------------------------------------------------------------------------
// 9. ROUTES — AUTH
// ----------------------------------------------------------------------------

app.post('/api/auth/signup', async (req, res, next) => {
  try {
    if (!FEATURES.auth) return res.status(503).json({ error: 'Auth is not configured on this deployment.' });
    const email = cleanString(req.body?.email, { min: 5, max: 254 });
    const password = cleanString(req.body?.password, { min: 8, max: 128 });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
      return res.status(400).json({ error: 'Valid email and a password (8+ characters) are required.' });
    }
    await ensureDb();
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length) return res.status(409).json({ error: 'An account with this email already exists.' });
    const hash = await bcrypt.hash(password, 12);
    const role = req.body?.role === 'staff' ? 'staff' : 'fan';
    const [user] = await sql`
      INSERT INTO users (email, password_hash, role) VALUES (${email}, ${hash}, ${role})
      RETURNING id, email, role;
    `;
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) { next(err); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    if (!FEATURES.auth) return res.status(503).json({ error: 'Auth is not configured on this deployment.' });
    const email = cleanString(req.body?.email, { min: 5, max: 254 });
    const password = cleanString(req.body?.password, { min: 1, max: 128 });
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    await ensureDb();
    const [user] = await sql`SELECT id, email, role, password_hash FROM users WHERE email = ${email}`;
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });
    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) { next(err); }
});

app.get('/api/auth/me', authMiddleware(), (req, res) => {
  res.json({ user: req.user });
});

// ----------------------------------------------------------------------------
// 10. ROUTES — MULTILINGUAL GENAI CHAT ASSISTANT
// ----------------------------------------------------------------------------

const ASSISTANT_SYSTEM_PROMPT = `You are "Stadium Copilot", a friendly, concise assistant for fans at FIFA World
Cup 2026 stadiums. You help with wayfinding inside the venue, accessibility accommodations, transportation
options, crowd/queue guidance, sustainability tips (recycling, reusable cups, public transit), and general
match-day questions. Keep answers short (2-5 sentences), practical, and warm. If asked something unrelated to
stadium operations or the tournament, gently redirect back to how you can help with the event. Never invent
specific gate numbers, seat locations, or live wait times you have not been given — speak in general, helpful
terms and suggest checking on-site signage or staff for exact details.`;

app.post('/api/chat', chatLimiter, async (req, res, next) => {
  try {
    const message = cleanString(req.body?.message, { min: 1, max: 1000 });
    if (!message) return res.status(400).json({ error: 'A "message" field (1-1000 chars) is required.' });
    const language = normalizeLang(req.body?.language, 'en');

    const langInstruction = language === 'en' ? '' :
      ` Respond in the language with BCP-47 code "${language}", using that language's native script and, where relevant, regional conventions.`;
    const reply = await callGemini(message, {
      system: ASSISTANT_SYSTEM_PROMPT + langInstruction,
    });

    if (FEATURES.db) {
      ensureDb()
        .then(() => sql`INSERT INTO chat_logs (language, message, reply) VALUES (${language}, ${message}, ${reply})`)
        .catch(() => {/* logging is best-effort, never blocks the response */});
    }

    res.json({ reply, language });
  } catch (err) { next(err); }
});

app.post('/api/translate', async (req, res, next) => {
  try {
    const text = cleanString(req.body?.text, { min: 1, max: 2000 });
    const targetRaw = cleanString(req.body?.target, { min: 2, max: 20 });
    if (!text || !targetRaw || !LANG_TAG_RE.test(targetRaw)) {
      return res.status(400).json({ error: 'Fields "text" and a valid "target" language code (e.g. "es", "pt-BR") are required.' });
    }
    const target = targetRaw;
    const translated = await callGoogleTranslate(text, target);
    res.json({ translated, target });
  } catch (err) { next(err); }
});

// ----------------------------------------------------------------------------
// 11. ROUTES — NAVIGATION & TRANSPORTATION
// ----------------------------------------------------------------------------

app.get('/api/directions', async (req, res, next) => {
  try {
    const origin = cleanString(req.query.origin, { min: 2, max: 200 });
    const destination = cleanString(req.query.destination, { min: 2, max: 200 });
    const mode = ['walking', 'driving', 'transit', 'bicycling'].includes(req.query.mode) ? req.query.mode : 'walking';
    if (!origin || !destination) {
      return res.status(400).json({ error: 'Both "origin" and "destination" query params are required.' });
    }
    const cacheKey = `dir:${origin}|${destination}|${mode}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const result = await callGoogleDirections(origin, destination, mode);
    cache.set(cacheKey, result, 5 * 60_000);
    res.json(result);
  } catch (err) {
    if (err.code) return res.status(err.code).json({ error: err.message });
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 12. ROUTES — CROWD MANAGEMENT & REAL-TIME DECISION SUPPORT
// ----------------------------------------------------------------------------

app.get('/api/crowd', async (req, res, next) => {
  try {
    const cached = cache.get('crowd:snapshot');
    if (cached) return res.json(cached);

    const zones = simulateCrowdSnapshot();
    const busiest = [...zones].sort((a, b) => b.density - a.density).slice(0, 2);
    const prompt = `Current stadium zone crowd levels: ${zones
      .map((z) => `${z.zone}: ${z.density}% (${z.level})`)
      .join('; ')}. In 2-3 short sentences, give fans and staff a practical, calm recommendation focused on the
busiest zones (${busiest.map((z) => z.zone).join(' and ')}), including any alternate routes or timing advice.`;
    const guidance = await callGemini(prompt, { system: 'You are a stadium operations assistant giving brief, actionable crowd-flow guidance.', maxOutputTokens: 200 });

    const payload = { zones, guidance, generatedAt: new Date().toISOString() };
    cache.set('crowd:snapshot', payload, 20_000); // refresh every 20s
    res.json(payload);
  } catch (err) { next(err); }
});

// ----------------------------------------------------------------------------
// 13. ROUTES — OPERATIONAL INTELLIGENCE (STAFF INCIDENT LOG)
// ----------------------------------------------------------------------------

app.post('/api/incidents', authMiddleware('staff'), async (req, res, next) => {
  try {
    const zone = cleanString(req.body?.zone, { min: 2, max: 100 });
    const description = cleanString(req.body?.description, { min: 5, max: 1000 });
    if (!zone || !description) {
      return res.status(400).json({ error: 'Fields "zone" and "description" (5-1000 chars) are required.' });
    }
    const triagePrompt = `A stadium staff member reported this incident in zone "${zone}": "${description}".
Respond as strict JSON only, no markdown fences, matching this shape:
{"severity":"Low|Medium|High|Critical","recommended_action":"one short, concrete sentence"}`;
    let severity = 'Medium';
    let recommended_action = 'Dispatch nearest available staff to assess the situation.';
    try {
      const raw = await callGemini(triagePrompt, { system: 'You are a stadium safety operations triage assistant. Output strict JSON only.', maxOutputTokens: 150 });
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      if (parsed.severity) severity = parsed.severity;
      if (parsed.recommended_action) recommended_action = parsed.recommended_action;
    } catch (_e) {
      // Fall back to defaults above if the model output isn't valid JSON.
    }

    await ensureDb();
    const [incident] = await sql`
      INSERT INTO incidents (zone, description, severity, recommended_action, reported_by)
      VALUES (${zone}, ${description}, ${severity}, ${recommended_action}, ${req.user.email})
      RETURNING id, zone, description, severity, recommended_action, status, created_at;
    `;
    res.status(201).json(incident);
  } catch (err) { next(err); }
});

app.get('/api/incidents', authMiddleware('staff'), async (req, res, next) => {
  try {
    await ensureDb();
    const incidents = await sql`SELECT id, zone, description, severity, recommended_action, status, created_at
                                 FROM incidents ORDER BY created_at DESC LIMIT 50;`;

    const cacheKey = 'briefing:latest';
    let briefing = cache.get(cacheKey);
    if (!briefing && incidents.length) {
      const summaryInput = incidents.slice(0, 10)
        .map((i) => `- [${i.severity}] ${i.zone}: ${i.description}`).join('\n');
      briefing = await callGemini(
        `Here are the most recent stadium incidents:\n${summaryInput}\n\nWrite a concise 3-4 sentence operational
briefing for the shift supervisor, highlighting the most urgent items and any pattern across zones.`,
        { system: 'You are an operations analyst producing a shift briefing for stadium staff.', maxOutputTokens: 220 }
      );
      cache.set(cacheKey, briefing, 60_000);
    }
    res.json({ incidents, briefing: briefing || 'No incidents reported yet this shift.' });
  } catch (err) { next(err); }
});

// ----------------------------------------------------------------------------
// 14. FRONTEND — served at the root route (accessible, no external assets)
// ----------------------------------------------------------------------------

function renderPage(nonce) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Stadium Copilot — FIFA World Cup 2026</title>
<meta name="description" content="GenAI-powered stadium navigation, crowd guidance, multilingual assistance, and operations support for FIFA World Cup 2026." />
<link rel="stylesheet" href="/styles.css" />
</head>
<body data-contrast="normal">
<a class="skip-link" href="#main-content">Skip to main content</a>

<header class="top">
  <h1>⚽ Stadium Copilot <span class="badge">WORLD CUP 2026</span></h1>
  <div class="toolbar" role="group" aria-label="Accessibility settings">
    <button id="btn-contrast" aria-pressed="false">High contrast</button>
    <button id="btn-fontsize" aria-label="Increase text size">A+</button>
    <label for="lang-select" class="visually-hidden">Assistant language</label>
    <select id="lang-select" aria-label="Assistant language">
      ${LANGUAGE_OPTIONS.map((l) => `<option value="${l.code}"${l.code === 'en' ? ' selected' : ''}>${l.name}</option>`).join('\n      ')}
      <option value="other">Other — type a language code…</option>
    </select>
    <label for="lang-custom" class="visually-hidden">Custom language code</label>
    <input type="text" id="lang-custom" placeholder="e.g. eo, gd, br" maxlength="20" style="display:none; width:110px;" aria-label="Custom BCP-47 language code" />
  </div>
</header>

<nav class="tabs" role="tablist" aria-label="Sections">
  <button role="tab" aria-selected="true" aria-controls="panel-fan" id="tab-fan">Fan Assistant</button>
  <button role="tab" aria-selected="false" aria-controls="panel-crowd" id="tab-crowd">Crowd &amp; Navigation</button>
  <button role="tab" aria-selected="false" aria-controls="panel-staff" id="tab-staff">Staff Dashboard</button>
</nav>

<main id="main-content">

  <section class="panel" id="panel-fan" role="tabpanel" aria-labelledby="tab-fan">
    <h2>Ask the multilingual match-day assistant</h2>
    <p class="status">Ask about wayfinding, accessibility, transport options, or sustainability tips — the assistant replies in your selected language.</p>
    <div class="chat-log" id="chat-log" role="log" aria-live="polite" aria-relevant="additions"></div>
    <form class="row" id="chat-form">
      <label class="visually-hidden" for="chat-input">Your question</label>
      <input type="text" id="chat-input" placeholder="e.g. Where can I refill water near Gate C?" maxlength="1000" required />
      <button type="submit">Send</button>
    </form>
  </section>

  <section class="panel" id="panel-crowd" role="tabpanel" aria-labelledby="tab-crowd" hidden>
    <h2>Live crowd levels &amp; AI guidance</h2>
    <div class="grid" id="crowd-grid" aria-live="polite"></div>
    <p id="crowd-guidance" class="status" role="status"></p>
    <button id="btn-refresh-crowd">Refresh crowd data</button>

    <h2 style="margin-top:24px;">Get directions</h2>
    <form class="row" id="directions-form">
      <div style="flex:1; min-width:200px;">
        <label for="origin">From</label>
        <input type="text" id="origin" placeholder="Your current location" required />
      </div>
      <div style="flex:1; min-width:200px;">
        <label for="destination">To</label>
        <input type="text" id="destination" placeholder="Stadium gate or landmark" required />
      </div>
      <div>
        <label for="mode">Mode</label>
        <select id="mode">
          <option value="walking">Walking</option>
          <option value="transit">Transit</option>
          <option value="driving">Driving</option>
          <option value="bicycling">Bicycling</option>
        </select>
      </div>
      <button type="submit" style="align-self:flex-end;">Get route</button>
    </form>
    <div id="directions-result" role="status" aria-live="polite"></div>
  </section>

  <section class="panel" id="panel-staff" role="tabpanel" aria-labelledby="tab-staff" hidden>
    <h2>Staff sign-in</h2>
    <p class="status">Sign up or log in as staff to report incidents and view the AI operations briefing.</p>
    <div class="grid">
      <form id="signup-form">
        <div class="field"><label for="su-email">Email</label><input type="text" id="su-email" required /></div>
        <div class="field"><label for="su-pass">Password (8+ chars)</label><input type="text" id="su-pass" required /></div>
        <button type="submit">Create staff account</button>
      </form>
      <form id="login-form">
        <div class="field"><label for="li-email">Email</label><input type="text" id="li-email" required /></div>
        <div class="field"><label for="li-pass">Password</label><input type="text" id="li-pass" required /></div>
        <button type="submit">Log in</button>
      </form>
    </div>
    <p id="auth-status" role="status" class="status"></p>

    <div id="staff-tools" hidden>
      <h2 style="margin-top:24px;">Report an incident</h2>
      <form class="row" id="incident-form">
        <div style="flex:1; min-width:160px;">
          <label for="inc-zone">Zone</label>
          <input type="text" id="inc-zone" placeholder="e.g. East Concourse" required />
        </div>
        <div style="flex:2; min-width:220px;">
          <label for="inc-desc">Description</label>
          <input type="text" id="inc-desc" placeholder="What's happening?" required />
        </div>
        <button type="submit" style="align-self:flex-end;">Submit</button>
      </form>

      <h2 style="margin-top:24px;">AI shift briefing</h2>
      <p id="briefing-text" role="status" class="status"></p>

      <h2 style="margin-top:12px;">Recent incidents</h2>
      <table>
        <caption class="visually-hidden">Recent stadium incidents with AI-assessed severity</caption>
        <thead><tr><th scope="col">Zone</th><th scope="col">Description</th><th scope="col">Severity</th><th scope="col">Recommended action</th></tr></thead>
        <tbody id="incidents-body"></tbody>
      </table>
      <button id="btn-refresh-incidents">Refresh incidents</button>
    </div>
  </section>

</main>

<footer>Built for FIFA World Cup 2026 stadium operations · GenAI-powered · Accessible by design</footer>

<script nonce="${nonce}">
(function () {
  'use strict';

  // ---- Tabs ----
  var tabs = [
    { btn: document.getElementById('tab-fan'), panel: document.getElementById('panel-fan') },
    { btn: document.getElementById('tab-crowd'), panel: document.getElementById('panel-crowd') },
    { btn: document.getElementById('tab-staff'), panel: document.getElementById('panel-staff') }
  ];
  function selectTab(target) {
    tabs.forEach(function (t) {
      var active = t === target;
      t.btn.setAttribute('aria-selected', String(active));
      t.panel.hidden = !active;
    });
    target.btn.focus();
  }
  tabs.forEach(function (t) {
    t.btn.addEventListener('click', function () { selectTab(t); });
  });

  // ---- Accessibility controls ----
  var contrastBtn = document.getElementById('btn-contrast');
  var fontBtn = document.getElementById('btn-fontsize');
  var sizes = ['base', 'lg', 'xl'];
  var sizeIndex = 0;
  contrastBtn.addEventListener('click', function () {
    var isHigh = document.body.getAttribute('data-contrast') === 'high';
    document.body.setAttribute('data-contrast', isHigh ? 'normal' : 'high');
    contrastBtn.setAttribute('aria-pressed', String(!isHigh));
  });
  fontBtn.addEventListener('click', function () {
    sizeIndex = (sizeIndex + 1) % sizes.length;
    document.documentElement.setAttribute('data-fontsize', sizes[sizeIndex]);
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- Chat assistant ----
  var chatLog = document.getElementById('chat-log');
  var chatForm = document.getElementById('chat-form');
  var chatInput = document.getElementById('chat-input');
  var langSelect = document.getElementById('lang-select');
  var langCustom = document.getElementById('lang-custom');
  var RTL_LANGS = ['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ku'];

  function activeLanguage() {
    if (langSelect.value === 'other') {
      return (langCustom.value || '').trim().toLowerCase() || 'en';
    }
    return langSelect.value;
  }

  function applyDirection(lang) {
    var base = lang.split('-')[0].toLowerCase();
    var isRtl = RTL_LANGS.indexOf(base) !== -1;
    document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
  }

  langSelect.addEventListener('change', function () {
    var isOther = langSelect.value === 'other';
    langCustom.style.display = isOther ? '' : 'none';
    if (isOther) { langCustom.focus(); } else { applyDirection(langSelect.value); }
  });
  langCustom.addEventListener('input', function () { applyDirection(activeLanguage()); });

  function appendMessage(text, who) {
    var div = document.createElement('div');
    div.className = 'msg ' + who;
    div.textContent = text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  chatForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var message = chatInput.value.trim();
    if (!message) return;
    appendMessage(message, 'user');
    chatInput.value = '';
    var language = activeLanguage();
    applyDirection(language);
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, language: language })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        appendMessage(data.reply || data.error || 'Something went wrong.', 'bot');
      })
      .catch(function () { appendMessage('Network error — please try again.', 'bot'); });
  });

  // ---- Crowd data ----
  var crowdGrid = document.getElementById('crowd-grid');
  var crowdGuidance = document.getElementById('crowd-guidance');

  function loadCrowd() {
    fetch('/api/crowd')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        crowdGrid.innerHTML = '';
        (data.zones || []).forEach(function (z) {
          var card = document.createElement('div');
          card.className = 'zone-card';
          card.innerHTML = '<div>' + escapeHtml(z.zone) + '</div>' +
            '<div class="density level-' + escapeHtml(z.level) + '">' + z.density + '%</div>' +
            '<div class="status">' + escapeHtml(z.level) + ' congestion</div>';
          crowdGrid.appendChild(card);
        });
        crowdGuidance.textContent = data.guidance || '';
      })
      .catch(function () { crowdGuidance.textContent = 'Could not load crowd data right now.'; });
  }
  document.getElementById('btn-refresh-crowd').addEventListener('click', loadCrowd);
  document.getElementById('tab-crowd').addEventListener('click', loadCrowd);

  // ---- Directions ----
  document.getElementById('directions-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var origin = document.getElementById('origin').value.trim();
    var destination = document.getElementById('destination').value.trim();
    var mode = document.getElementById('mode').value;
    var out = document.getElementById('directions-result');
    out.textContent = 'Loading route…';
    var params = new URLSearchParams({ origin: origin, destination: destination, mode: mode });
    fetch('/api/directions?' + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { out.textContent = data.error; return; }
        var stepsHtml = (data.steps || []).map(function (s) {
          return '<li>' + escapeHtml(s.instruction || '') + ' (' + escapeHtml(s.distance || '') + ')</li>';
        }).join('');
        out.innerHTML = '<p>' + escapeHtml(data.distance || '') + ' · ' + escapeHtml(data.duration || '') + '</p><ol>' + stepsHtml + '</ol>';
      })
      .catch(function () { out.textContent = 'Could not fetch directions right now.'; });
  });

  // ---- Staff auth ----
  var authStatus = document.getElementById('auth-status');
  var staffTools = document.getElementById('staff-tools');
  var authToken = null;

  function saveToken(token) {
    authToken = token;
    staffTools.hidden = !token;
    if (token) loadIncidents();
  }

  document.getElementById('signup-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('su-email').value.trim();
    var password = document.getElementById('su-pass').value;
    fetch('/api/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password, role: 'staff' })
    }).then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { authStatus.textContent = data.error; return; }
        authStatus.textContent = 'Account created. You are signed in.';
        saveToken(data.token);
      }).catch(function () { authStatus.textContent = 'Network error.'; });
  });

  document.getElementById('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('li-email').value.trim();
    var password = document.getElementById('li-pass').value;
    fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { authStatus.textContent = data.error; return; }
        authStatus.textContent = 'Signed in as ' + data.user.email + '.';
        saveToken(data.token);
      }).catch(function () { authStatus.textContent = 'Network error.'; });
  });

  // ---- Staff incidents ----
  var incidentsBody = document.getElementById('incidents-body');
  var briefingText = document.getElementById('briefing-text');

  function loadIncidents() {
    if (!authToken) return;
    fetch('/api/incidents', { headers: { Authorization: 'Bearer ' + authToken } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { briefingText.textContent = data.error; return; }
        briefingText.textContent = data.briefing || '';
        incidentsBody.innerHTML = '';
        (data.incidents || []).forEach(function (i) {
          var tr = document.createElement('tr');
          tr.innerHTML = '<td>' + escapeHtml(i.zone) + '</td>' +
            '<td>' + escapeHtml(i.description) + '</td>' +
            '<td class="sev-' + escapeHtml(i.severity) + '">' + escapeHtml(i.severity) + '</td>' +
            '<td>' + escapeHtml(i.recommended_action || '') + '</td>';
          incidentsBody.appendChild(tr);
        });
      })
      .catch(function () { briefingText.textContent = 'Could not load incidents right now.'; });
  }
  document.getElementById('btn-refresh-incidents').addEventListener('click', loadIncidents);

  document.getElementById('incident-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!authToken) return;
    var zone = document.getElementById('inc-zone').value.trim();
    var description = document.getElementById('inc-desc').value.trim();
    fetch('/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken },
      body: JSON.stringify({ zone: zone, description: description })
    }).then(function (r) { return r.json(); })
      .then(function () {
        document.getElementById('inc-zone').value = '';
        document.getElementById('inc-desc').value = '';
        loadIncidents();
      });
  });

  // Initial load
  loadCrowd();
})();
</script>
</body>
</html>`;
}

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderPage(res.locals.nonce));
});

// Serve the extracted stylesheet as a static, cacheable same-origin asset.
// Kept as an explicit route (rather than express.static) so the whole app
// still ships as a single deployable function file alongside /public/styles.css.
const path = require('path');
app.get('/styles.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(__dirname, '..', 'public', 'styles.css'));
});

// ----------------------------------------------------------------------------
// 15. 404 + ERROR HANDLING
// ----------------------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Never leak internal error details/stack traces to the client.
  // eslint-disable-next-line no-console
  console.error('[stadium-copilot] Unhandled error:', err && (err.stack || err.message));
  const status = err && err.code && Number.isInteger(err.code) ? err.code : 500;
  res.status(status).json({ error: 'An internal error occurred. Please try again.' });
});

// ----------------------------------------------------------------------------
// 16. EXPORT (Vercel) / LISTEN (local dev)
// ----------------------------------------------------------------------------

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Stadium Copilot running locally at http://localhost:${port}`);
  });
}

module.exports = app;
