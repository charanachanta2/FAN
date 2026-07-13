// Unit tests for pure utility/service modules extracted out of the route
// handlers. These run instantly (no HTTP server, no external services) and
// pin down behavior that the integration tests in app.test.js don't reach
// directly (e.g. cache expiry, string validation edge cases, crowd-level
// thresholds, and the real-time decision-support ranking logic).

const test = require('node:test');
const assert = require('node:assert');

const { TTLCache } = require('../src/utils/cache');
const { cleanString, normalizeLang, escapeHtml, EMAIL_RE } = require('../src/utils/validation');
const { densityToLevel, busiestZones } = require('../src/services/crowd');
const { buildPriorityQueue } = require('../src/routes/dashboard');

test('TTLCache returns undefined for missing keys', () => {
  const cache = new TTLCache();
  assert.strictEqual(cache.get('missing'), undefined);
});

test('TTLCache returns a stored value before it expires', () => {
  const cache = new TTLCache();
  cache.set('k', { a: 1 }, 10_000);
  assert.deepStrictEqual(cache.get('k'), { a: 1 });
});

test('TTLCache expires values after their TTL', () => {
  const cache = new TTLCache();
  cache.set('k', 'v', -1); // already expired
  assert.strictEqual(cache.get('k'), undefined);
});

test('cleanString trims and enforces length bounds', () => {
  assert.strictEqual(cleanString('  hi  ', { min: 1, max: 10 }), 'hi');
  assert.strictEqual(cleanString('', { min: 1, max: 10 }), null);
  assert.strictEqual(cleanString('a'.repeat(11), { min: 1, max: 10 }), null);
  assert.strictEqual(cleanString(42), null);
});

test('normalizeLang accepts valid BCP-47-shaped tags and rejects junk', () => {
  assert.strictEqual(normalizeLang('pt-BR'), 'pt-BR');
  assert.strictEqual(normalizeLang('en'), 'en');
  assert.strictEqual(normalizeLang('???', 'en'), 'en');
  assert.strictEqual(normalizeLang(undefined, 'en'), 'en');
});

test('escapeHtml neutralizes markup-significant characters', () => {
  assert.strictEqual(escapeHtml('<script>&"\''), '&lt;script&gt;&amp;&quot;&#39;');
});

test('EMAIL_RE accepts plausible emails and rejects obvious junk', () => {
  assert.ok(EMAIL_RE.test('fan@example.com'));
  assert.ok(!EMAIL_RE.test('not-an-email'));
});

test('densityToLevel maps density percentages to congestion levels', () => {
  assert.strictEqual(densityToLevel(10), 'Low');
  assert.strictEqual(densityToLevel(50), 'Moderate');
  assert.strictEqual(densityToLevel(70), 'High');
  assert.strictEqual(densityToLevel(90), 'Critical');
});

test('busiestZones returns the top N zones by density, highest first', () => {
  const zones = [
    { zone: 'A', density: 10 },
    { zone: 'B', density: 90 },
    { zone: 'C', density: 50 },
  ];
  const top2 = busiestZones(zones, 2);
  assert.deepStrictEqual(top2.map((z) => z.zone), ['B', 'C']);
});

test('buildPriorityQueue ranks Critical incidents above Low-density crowd zones', () => {
  const crowd = {
    zones: [
      { zone: 'North Gate', density: 30, level: 'Low' },
      { zone: 'South Gate', density: 70, level: 'High' },
    ],
  };
  const incidentsPayload = {
    incidents: [
      { zone: 'Fan Zone Plaza', description: 'Medical incident', severity: 'Critical', status: 'open', recommended_action: 'Dispatch medics.' },
    ],
  };
  const queue = buildPriorityQueue(crowd, incidentsPayload);
  assert.strictEqual(queue[0].type, 'incident');
  assert.strictEqual(queue[0].zone, 'Fan Zone Plaza');
  // The Low-density zone should be excluded entirely (nothing urgent there).
  assert.ok(!queue.some((item) => item.type === 'crowd' && item.zone === 'North Gate'));
});

test('buildPriorityQueue excludes resolved incidents', () => {
  const crowd = { zones: [] };
  const incidentsPayload = {
    incidents: [
      { zone: 'East Concourse', description: 'Cleared spill', severity: 'Low', status: 'resolved' },
    ],
  };
  const queue = buildPriorityQueue(crowd, incidentsPayload);
  assert.strictEqual(queue.length, 0);
});
