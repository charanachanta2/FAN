'use strict';

/**
 * ============================================================================
 *  FIFA WORLD CUP 2026 — STADIUM COPILOT
 *  A GenAI-powered stadium operations & fan-experience platform.
 * ============================================================================
 *
 *  ARCHITECTURE
 *  ------------
 *  The whole app (backend API + the accessible HTML/CSS/JS frontend) still
 *  deploys as ONE Vercel serverless function — `api/index.js` requires this
 *  file, which requires every module below, and Vercel bundles the full
 *  dependency graph into that single function. Splitting the implementation
 *  across small, single-purpose files (config, db, services, middleware,
 *  routes) does not change that deployment shape; it only makes the code
 *  easier to read, test, and extend. See README.md's "Project structure"
 *  section for the full file map.
 *
 *  FEATURES (mapped to the problem statement)
 *  --------------------------------------------
 *   1. Navigation & Transportation  -> src/routes/directions.js   (/api/directions)
 *   2. Multilingual Assistance      -> src/routes/chat.js         (/api/chat)
 *                                       src/routes/translate.js   (/api/translate)
 *   3. Crowd Management             -> src/routes/crowd.js        (/api/crowd)
 *   4. Operational Intelligence     -> src/routes/incidents.js    (/api/incidents)
 *   5. Real-time Decision Support   -> src/routes/dashboard.js    (/api/dashboard)
 *                                       — a dedicated surface that merges live
 *                                       crowd hot spots with open incidents into
 *                                       one ranked, refreshable priority queue,
 *                                       in addition to the AI recommendations
 *                                       already embedded in crowd/incident replies.
 *   6. Accessibility                -> src/frontend/page.js + public/app.js:
 *                                       skip links, ARIA live regions, high-contrast
 *                                       + large-text modes, full keyboard support,
 *                                       lang/dir sync with the assistant's reply language
 *   7. Sustainability               -> src/routes/sustainability.js (/api/sustainability)
 *
 *  SECURITY NOTES — see src/middleware/security.js and README.md for detail.
 *  ENVIRONMENT VARIABLES — see src/config/env.js and README.md for detail.
 * ============================================================================
 */

const path = require('path');
const express = require('express');
const compression = require('compression');

const { warnMissing } = require('./config/env');
const { corsMiddleware, helmetMiddleware, apiLimiter } = require('./middleware/security');
const { renderPage } = require('./frontend/page');

warnMissing();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(compression());
app.use(express.json({ limit: '64kb' }));
app.use(corsMiddleware);
app.use(helmetMiddleware);

// Global API rate limit; individual routers apply stricter limits on top of
// this for sensitive endpoints (chat, auth).
app.use('/api/', apiLimiter);

// ----------------------------------------------------------------------------
// Feature routers — each owns one problem-statement pillar (see header above).
// ----------------------------------------------------------------------------
app.use('/api', require('./routes/health'));
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/chat'));
app.use('/api', require('./routes/translate'));
app.use('/api', require('./routes/directions'));
app.use('/api', require('./routes/crowd'));
app.use('/api', require('./routes/sustainability'));
app.use('/api', require('./routes/incidents'));
app.use('/api', require('./routes/dashboard'));

// ----------------------------------------------------------------------------
// Frontend — server-rendered HTML shell + its static assets.
// ----------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderPage());
});

// Explicit routes (rather than express.static) so the whole app still ships
// as a single deployable function alongside the two files under /public.
app.get('/styles.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(__dirname, '..', 'public', 'styles.css'));
});

app.get('/app.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(__dirname, '..', 'public', 'app.js'));
});

// ----------------------------------------------------------------------------
// 404 + centralized error handling
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

module.exports = app;
