'use strict';

const { ENV, FEATURES } = require('../config/env');
const { callGemini } = require('./gemini');

/** Translates `text` into `targetLang`, preferring Google Cloud Translation. */
async function callGoogleTranslate(text, targetLang) {
  if (FEATURES.translate) {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${ENV.GOOGLE_TRANSLATE_API_KEY}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, target: targetLang, format: 'text' }),
    });
    if (!resp.ok) throw new Error(`Translate API error ${resp.status}`);
    const data = await resp.json();
    return data?.data?.translations?.[0]?.translatedText || text;
  }
  // Fallback: use Gemini as a translator if Cloud Translation isn't configured.
  return callGemini(`Translate the following text into language code "${targetLang}". ` +
    `Return ONLY the translated text, nothing else:\n\n${text}`);
}

module.exports = { callGoogleTranslate };
