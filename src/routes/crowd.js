'use strict';

const express = require('express');
const { callGemini } = require('../services/gemini');
const { simulateCrowdSnapshot, busiestZones } = require('../services/crowd');
const { cache } = require('../cache');

const router = express.Router();

const CROWD_CACHE_KEY = 'crowd:snapshot';
const CROWD_TTL_MS = 20_000; // refresh every 20s

/** Builds (and caches) a fresh crowd snapshot + AI guidance payload. */
async function buildCrowdPayload() {
  const cached = cache.get(CROWD_CACHE_KEY);
  if (cached) return cached;

  const zones = simulateCrowdSnapshot();
  const busiest = busiestZones(zones, 2);
  const prompt = `Current stadium zone crowd levels: ${zones
    .map((z) => `${z.zone}: ${z.density}% (${z.level})`)
    .join('; ')}. In 2-3 short sentences, give fans and staff a practical, calm recommendation focused on the
busiest zones (${busiest.map((z) => z.zone).join(' and ')}), including any alternate routes or timing advice.`;
  const guidance = await callGemini(prompt, {
    system: 'You are a stadium operations assistant giving brief, actionable crowd-flow guidance.',
    maxOutputTokens: 200,
  });

  const payload = { zones, guidance, generatedAt: new Date().toISOString() };
  cache.set(CROWD_CACHE_KEY, payload, CROWD_TTL_MS);
  return payload;
}

router.get('/crowd', async (req, res, next) => {
  try {
    res.json(await buildCrowdPayload());
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.buildCrowdPayload = buildCrowdPayload;
