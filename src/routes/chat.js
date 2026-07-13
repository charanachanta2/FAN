'use strict';

const express = require('express');
const { FEATURES } = require('../config/env');
const { ensureDb, sql } = require('../db');
const { callGemini } = require('../services/gemini');
const { chatLimiter } = require('../middleware/security');
const { cleanString, normalizeLang } = require('../utils/validation');

const router = express.Router();

const ASSISTANT_SYSTEM_PROMPT = `You are "Stadium Copilot", a friendly, concise assistant for fans at FIFA World
Cup 2026 stadiums. You help with wayfinding inside the venue, accessibility accommodations, transportation
options, crowd/queue guidance, sustainability tips (recycling, reusable cups, public transit), and general
match-day questions. Keep answers short (2-5 sentences), practical, and warm. If asked something unrelated to
stadium operations or the tournament, gently redirect back to how you can help with the event. Never invent
specific gate numbers, seat locations, or live wait times you have not been given — speak in general, helpful
terms and suggest checking on-site signage or staff for exact details.`;

router.post('/chat', chatLimiter, async (req, res, next) => {
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

module.exports = router;
