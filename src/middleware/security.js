'use strict';

const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ENV } = require('../config/env');

/** CORS: same-origin-friendly by default, or a configured allow-list. */
const corsMiddleware = cors({
  origin: ENV.ALLOWED_ORIGIN ? ENV.ALLOWED_ORIGIN.split(',').map((s) => s.trim()) : true,
  methods: ['GET', 'POST'],
});

// The frontend script ships as a same-origin static file (/app.js), so the
// CSP can require 'self' only for scripts — no 'unsafe-inline' and no nonce
// bookkeeping needed anywhere in the app.
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginEmbedderPolicy: false,
});

// Global API rate limit + a stricter one for the AI chat endpoint, plus a
// tighter limit on signup/login specifically, to blunt credential-stuffing
// and password-guessing attempts beyond what the general API limiter allows.
const apiLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const chatLimiter = rateLimit({ windowMs: 60_000, max: 15, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });

module.exports = {
  corsMiddleware,
  nonceMiddleware,
  helmetMiddleware,
  apiLimiter,
  chatLimiter,
  authLimiter,
};
