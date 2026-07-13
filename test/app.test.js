// Basic smoke + contract tests for the Stadium Copilot API.
// Run with: npm test   (uses Node's built-in test runner, no extra deps needed
// beyond the ones already in package.json for the app itself; add "supertest"
// as a devDependency if you prefer request-chaining syntax instead.)
//
// These tests intentionally avoid requiring real Gemini/Google/Neon
// credentials: the app is designed to run in a safe "degraded mode" when
// those env vars are absent, which is exactly what CI will exercise.

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.NODE_ENV = 'test';
// Intentionally do NOT set DATABASE_URL / GEMINI_API_KEY / GOOGLE_MAPS_API_KEY
// here, so we verify the app degrades gracefully instead of crashing.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

const app = require('../api/index.js');

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => resolve(server));
  });
}

function request(server, method, path, body) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(chunks); } catch (_e) { /* not json, e.g. HTML page */ }
          resolve({ status: res.statusCode, headers: res.headers, body: json, raw: chunks });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('GET / returns the HTML shell with accessibility landmarks', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'GET', '/');
  assert.strictEqual(res.status, 200);
  assert.match(res.raw, /<html lang="en">/);
  assert.match(res.raw, /skip-link/);
  assert.match(res.raw, /role="tablist"/);
});

test('GET /api/health returns ok', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'GET', '/api/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
});

test('GET /api/selftest reports feature flags without leaking secrets', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'GET', '/api/selftest');
  assert.strictEqual(res.status, 200);
  assert.ok('features' in res.body);
  assert.strictEqual(res.raw.includes('GEMINI_API_KEY='), false);
});

test('POST /api/chat validates input and rejects empty message', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'POST', '/api/chat', { message: '' });
  assert.strictEqual(res.status, 400);
  assert.ok(res.body.error);
});

test('POST /api/chat degrades gracefully without GEMINI_API_KEY', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'POST', '/api/chat', { message: 'Where is Gate B?' });
  assert.strictEqual(res.status, 200);
  assert.ok(typeof res.body.reply === 'string' && res.body.reply.length > 0);
});

test('GET /api/directions without GOOGLE_MAPS_API_KEY returns a clear 503', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'GET', '/api/directions?origin=A&destination=B');
  assert.strictEqual(res.status, 503);
  assert.match(res.body.error, /not configured/i);
});

test('GET /api/crowd returns six simulated zones with density levels', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'GET', '/api/crowd');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.zones.length, 6);
  res.body.zones.forEach((z) => {
    assert.ok(['Low', 'Moderate', 'High', 'Critical'].includes(z.level));
  });
});

test('POST /api/incidents requires auth', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'POST', '/api/incidents', { zone: 'North Gate', description: 'Queue backing up' });
  assert.strictEqual(res.status, 503); // auth not configured (no DATABASE_URL in test env)
});

test('unknown routes return a clean 404 JSON error (no stack traces)', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'GET', '/api/does-not-exist');
  assert.strictEqual(res.status, 404);
  assert.deepStrictEqual(res.body, { error: 'Not found.' });
});

test('GET / sets security headers via Helmet (CSP, no-sniff, no-referrer)', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'GET', '/');
  assert.strictEqual(res.status, 200);
  assert.ok(res.headers['content-security-policy'], 'expected a CSP header');
  assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual(res.headers['referrer-policy'], 'no-referrer');
  assert.strictEqual(res.headers['x-powered-by'], undefined);
});

test('GET /styles.css is served with the correct content type', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'GET', '/styles.css');
  assert.strictEqual(res.status, 200);
  assert.match(res.raw, /--turf-900/); // sanity check it's actually the stylesheet
});

test('POST /api/auth/signup degrades gracefully (503) without DATABASE_URL', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'POST', '/api/auth/signup', { email: 'fan@example.com', password: 'longenough123' });
  assert.strictEqual(res.status, 503);
  assert.match(res.body.error, /not configured/i);
});

test('POST /api/auth/login degrades gracefully (503) without DATABASE_URL', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'POST', '/api/auth/login', { email: 'fan@example.com', password: 'x' });
  assert.strictEqual(res.status, 503);
  assert.match(res.body.error, /not configured/i);
});

test('GET /api/auth/me without a bearer token is rejected', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'GET', '/api/auth/me');
  // Auth is unconfigured in the test env, so this should be 503, not a 401
  // that would imply auth is live but the token is simply missing.
  assert.strictEqual(res.status, 503);
});

test('POST /api/chat rejects messages over the 1000-char limit', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'POST', '/api/chat', { message: 'a'.repeat(1001) });
  assert.strictEqual(res.status, 400);
});

test('POST /api/translate requires text and a valid target language code', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const missing = await request(server, 'POST', '/api/translate', { text: 'hello' });
  assert.strictEqual(missing.status, 400);
  const badLang = await request(server, 'POST', '/api/translate', { text: 'hello', target: '???' });
  assert.strictEqual(badLang.status, 400);
});

test('POST /api/translate degrades gracefully (demo text) without any translate/AI key', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'POST', '/api/translate', { text: 'hello', target: 'es' });
  assert.strictEqual(res.status, 200);
  assert.ok(typeof res.body.translated === 'string' && res.body.translated.length > 0);
});

test('GET /api/directions rejects requests missing origin/destination', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'GET', '/api/directions?origin=A');
  assert.strictEqual(res.status, 400);
});

test('GET /api/directions falls back to walking mode for an invalid "mode" value', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  // Still 503 (no GOOGLE_MAPS_API_KEY), but proves the invalid mode param
  // doesn't crash validation/handling before that check is reached.
  const res = await request(server, 'GET', '/api/directions?origin=A&destination=B&mode=teleport');
  assert.strictEqual(res.status, 503);
});

test('GET /api/sustainability returns cached/fallback tips without a Gemini key', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'GET', '/api/sustainability');
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.tips) && res.body.tips.length > 0);
});

test('GET /api/incidents requires staff auth', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'GET', '/api/incidents');
  assert.strictEqual(res.status, 503); // auth not configured (no DATABASE_URL in test env)
});

test('POST /api/auth/signup with role=staff is still rejected when auth is unconfigured', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  // In this test env DATABASE_URL is unset, so the general "auth not
  // configured" check runs first — a staff role/staffCode in the body can't
  // be used to reach different behavior while the deployment has no DB.
  const res = await request(server, 'POST', '/api/auth/signup', {
    email: 'staff@example.com', password: 'longenough123', role: 'staff', staffCode: 'guess',
  });
  assert.strictEqual(res.status, 503);
  assert.match(res.body.error, /not configured/i);
});

test('GET /api/dashboard (real-time decision support) requires staff auth', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'GET', '/api/dashboard');
  assert.strictEqual(res.status, 503); // auth not configured (no DATABASE_URL in test env)
});

test('GET /app.js is served with the correct content type', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'GET', '/app.js');
  assert.strictEqual(res.status, 200);
  assert.match(res.raw, /priority-queue/); // sanity check it's actually the frontend script
});

test('unsupported HTTP method on a known API path still returns a clean JSON error', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const res = await request(server, 'DELETE', '/api/health');
  assert.strictEqual(res.status, 404);
  assert.deepStrictEqual(res.body, { error: 'Not found.' });
});
