'use strict';

const express = require('express');
const { callGoogleTranslate } = require('../services/translate');
const { cleanString, LANG_TAG_RE } = require('../utils/validation');

const router = express.Router();

router.post('/translate', async (req, res, next) => {
  try {
    const text = cleanString(req.body?.text, { min: 1, max: 2000 });
    const target = cleanString(req.body?.target, { min: 2, max: 20 });
    if (!text || !target || !LANG_TAG_RE.test(target)) {
      return res.status(400).json({ error: 'Fields "text" and a valid "target" language code (e.g. "es", "pt-BR") are required.' });
    }
    const translated = await callGoogleTranslate(text, target);
    res.json({ translated, target });
  } catch (err) { next(err); }
});

module.exports = router;
