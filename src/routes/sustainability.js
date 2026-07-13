'use strict';

const express = require('express');
const { FEATURES } = require('../config/env');
const { callGeminiJson } = require('../services/gemini');
const { cache } = require('../cache');

const router = express.Router();

// A standalone, cached endpoint for eco/sustainability guidance, distinct
// from the chat assistant so "sustainability" (one of the platform's core
// problem-statement pillars) has its own first-class surface in the UI
// rather than only being reachable by asking the chatbot about it.
const SUSTAINABILITY_FALLBACK_TIPS = [
  'Use the reusable-cup stations near every concourse instead of single-use cups.',
  'Sort waste at the marked recycling and compost bins — signage matches the bin colors.',
  'Take public transit or the shuttle to the stadium to cut event-day traffic and emissions.',
  'Refill water bottles at free hydration stations instead of buying single-use bottles.',
  'Walk or bike to nearby transit hubs when the route is safe and well-lit.',
];

const SUSTAINABILITY_CACHE_KEY = 'sustainability:tips';
const SUSTAINABILITY_TTL_MS = 30 * 60_000; // tips don't need to change often

router.get('/sustainability', async (req, res, next) => {
  try {
    const cached = cache.get(SUSTAINABILITY_CACHE_KEY);
    if (cached) return res.json(cached);

    let tips = SUSTAINABILITY_FALLBACK_TIPS;
    if (FEATURES.gemini) {
      const parsed = await callGeminiJson(
        'List 5 short, concrete sustainability tips for fans attending a FIFA World Cup 2026 match ' +
          '(recycling, reusable cups/bottles, public transit, waste sorting, energy/water conservation). ' +
          'Respond as strict JSON only, no markdown fences: {"tips":["...", "...", "...", "...", "..."]}',
        { system: 'You are a stadium sustainability coordinator. Output strict JSON only.', maxOutputTokens: 300 },
        null
      );
      if (parsed && Array.isArray(parsed.tips) && parsed.tips.length) {
        tips = parsed.tips.slice(0, 8).map((t) => String(t).slice(0, 300));
      }
    }
    const payload = { tips, generatedAt: new Date().toISOString() };
    cache.set(SUSTAINABILITY_CACHE_KEY, payload, SUSTAINABILITY_TTL_MS);
    res.json(payload);
  } catch (err) { next(err); }
});

module.exports = router;
