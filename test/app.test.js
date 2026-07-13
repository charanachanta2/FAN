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
          resolve({ status: res.statusCode, body: json, raw: chunks });
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
