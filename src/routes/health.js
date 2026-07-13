'use strict';

const express = require('express');
const { ENV, FEATURES } = require('../config/env');
const { ensureDb, sql } = require('../db');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Lightweight built-in self-test: verifies config & connectivity without
// exposing secrets. Useful as a smoke test after every deploy.
router.get('/selftest', async (req, res) => {
  const results = { features: FEATURES, checks: {} };
  results.checks.env_jwt_secret = Boolean(ENV.JWT_SECRET);
  results.checks.env_gemini_key = Boolean(ENV.GEMINI_API_KEY);
  results.checks.env_maps_key = Boolean(ENV.GOOGLE_MAPS_API_KEY);
  if (FEATURES.db) {
    try {
      await ensureDb();
      await sql`SELECT 1`;
      results.checks.database = 'connected';
    } catch (_err) {
      results.checks.database = 'error';
    }
  } else {
    results.checks.database = 'not_configured';
  }
  res.json(results);
});

module.exports = router;
