'use strict';

const express = require('express');
const { ensureDb, sql } = require('../db');
const { callGeminiJson, callGemini } = require('../services/gemini');
const { authMiddleware } = require('../middleware/auth');
const { cache } = require('../cache');
const { cleanString } = require('../utils/validation');

const router = express.Router();

const BRIEFING_CACHE_KEY = 'briefing:latest';
const BRIEFING_TTL_MS = 60_000;

router.post('/incidents', authMiddleware('staff'), async (req, res, next) => {
  try {
    const zone = cleanString(req.body?.zone, { min: 2, max: 100 });
    const description = cleanString(req.body?.description, { min: 5, max: 1000 });
    if (!zone || !description) {
      return res.status(400).json({ error: 'Fields "zone" and "description" (5-1000 chars) are required.' });
    }
    const triagePrompt = `A stadium staff member reported this incident in zone "${zone}": "${description}".
Respond as strict JSON only, no markdown fences, matching this shape:
{"severity":"Low|Medium|High|Critical","recommended_action":"one short, concrete sentence"}`;
    const triage = await callGeminiJson(
      triagePrompt,
      { system: 'You are a stadium safety operations triage assistant. Output strict JSON only.', maxOutputTokens: 150 },
      null
    );
    const severity = triage?.severity || 'Medium';
    const recommendedAction = triage?.recommended_action || 'Dispatch nearest available staff to assess the situation.';

    await ensureDb();
    const [incident] = await sql`
      INSERT INTO incidents (zone, description, severity, recommended_action, reported_by)
      VALUES (${zone}, ${description}, ${severity}, ${recommendedAction}, ${req.user.email})
      RETURNING id, zone, description, severity, recommended_action, status, created_at;
    `;
    res.status(201).json(incident);
  } catch (err) { next(err); }
});

/** Fetches the most recent incidents and the current (cached) shift briefing. */
async function fetchIncidentsWithBriefing() {
  await ensureDb();
  const incidents = await sql`SELECT id, zone, description, severity, recommended_action, status, created_at
                               FROM incidents ORDER BY created_at DESC LIMIT 50;`;

  let briefing = cache.get(BRIEFING_CACHE_KEY);
  if (!briefing && incidents.length) {
    const summaryInput = incidents.slice(0, 10)
      .map((i) => `- [${i.severity}] ${i.zone}: ${i.description}`).join('\n');
    briefing = await callGemini(
      `Here are the most recent stadium incidents:\n${summaryInput}\n\nWrite a concise 3-4 sentence operational
briefing for the shift supervisor, highlighting the most urgent items and any pattern across zones.`,
      { system: 'You are an operations analyst producing a shift briefing for stadium staff.', maxOutputTokens: 220 }
    );
    cache.set(BRIEFING_CACHE_KEY, briefing, BRIEFING_TTL_MS);
  }
  return { incidents, briefing: briefing || 'No incidents reported yet this shift.' };
}

router.get('/incidents', authMiddleware('staff'), async (req, res, next) => {
  try {
    res.json(await fetchIncidentsWithBriefing());
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.fetchIncidentsWithBriefing = fetchIncidentsWithBriefing;
