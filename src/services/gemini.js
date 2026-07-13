'use strict';

const { ENV, FEATURES } = require('../config/env');

const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Calls Gemini's generateContent REST endpoint directly (no extra SDK
 * dependency needed), with a system instruction and a hard timeout so a slow
 * upstream call can never hang a serverless invocation indefinitely.
 *
 * Falls back to a clearly-labeled demo response when GEMINI_API_KEY is not
 * configured, so every caller degrades gracefully instead of failing.
 */
async function callGemini(prompt, { system, maxOutputTokens = 512, timeoutMs = 9000 } = {}) {
  if (!FEATURES.gemini) {
    return '(Demo mode: GEMINI_API_KEY is not configured, so this is a placeholder response. ' +
      'Set GEMINI_API_KEY in your environment to enable live GenAI answers.)';
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${ENV.GEMINI_API_KEY}`;
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens, temperature: 0.4 },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Gemini API error ${resp.status}: ${errText.slice(0, 300)}`);
    }
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    return text.trim() || 'Sorry, I could not generate a response just now.';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls Gemini and parses the response as strict JSON (models are asked to
 * reply with JSON-only, but may still wrap it in markdown fences).
 * Returns `fallback` if the call fails or the output isn't valid JSON.
 */
async function callGeminiJson(prompt, options, fallback) {
  try {
    const raw = await callGemini(prompt, options);
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return parsed;
  } catch (_err) {
    return fallback;
  }
}

module.exports = { callGemini, callGeminiJson, GEMINI_MODEL };
