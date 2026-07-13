'use strict';

/** Escapes untrusted text before it is ever interpolated into HTML markup. */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/**
 * Clamp + validate a plain string field.
 * Returns the trimmed string if it's a string within [min, max] length,
 * otherwise `null`.
 */
function cleanString(input, { min = 1, max = 2000 } = {}) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
}

// Matches any BCP-47-style language tag (e.g. "en", "pt-BR", "zh-Hant", "yue").
// Rather than whitelist a handful of languages, we validate the *shape* of the
// code and let Gemini (and Google Translate, when configured) do the actual
// translation — this means every language Gemini can speak is supported here,
// not just a curated subset.
const LANG_TAG_RE = /^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8}){0,2}$/;

/** Validates a BCP-47-shaped language tag, falling back to `fallback` if invalid. */
function normalizeLang(input, fallback = 'en') {
  const trimmed = cleanString(input, { min: 2, max: 20 });
  if (!trimmed || !LANG_TAG_RE.test(trimmed)) return fallback;
  return trimmed;
}

/** A valid, non-empty, RFC-5322-ish email address. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Whitelisted transportation modes accepted by /api/directions. */
const DIRECTIONS_MODES = ['walking', 'driving', 'transit', 'bicycling'];

module.exports = {
  escapeHtml,
  cleanString,
  normalizeLang,
  LANG_TAG_RE,
  EMAIL_RE,
  DIRECTIONS_MODES,
};
