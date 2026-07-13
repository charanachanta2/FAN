'use strict';

const express = require('express');
const { callGoogleDirections } = require('../services/directions');
const { cache } = require('../cache');
const { cleanString, DIRECTIONS_MODES } = require('../utils/validation');

const router = express.Router();

router.get('/directions', async (req, res, next) => {
  try {
    const origin = cleanString(req.query.origin, { min: 2, max: 200 });
    const destination = cleanString(req.query.destination, { min: 2, max: 200 });
    const mode = DIRECTIONS_MODES.includes(req.query.mode) ? req.query.mode : 'walking';
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

module.exports = router;
