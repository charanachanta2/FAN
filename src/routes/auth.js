'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { ENV, FEATURES } = require('../config/env');
const { ensureDb, sql } = require('../db');
const { signToken, authMiddleware } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');
const { cleanString, EMAIL_RE } = require('../utils/validation');

const router = express.Router();

router.post('/auth/signup', authLimiter, async (req, res, next) => {
  try {
    if (!FEATURES.auth) return res.status(503).json({ error: 'Auth is not configured on this deployment.' });
    const email = cleanString(req.body?.email, { min: 5, max: 254 })?.toLowerCase() || null;
    const password = cleanString(req.body?.password, { min: 8, max: 128 });
    if (!email || !EMAIL_RE.test(email) || !password) {
      return res.status(400).json({ error: 'Valid email and a password (8+ characters) are required.' });
    }
    const wantsStaff = req.body?.role === 'staff';
    if (wantsStaff) {
      if (!ENV.STAFF_SIGNUP_CODE) {
        return res.status(403).json({ error: 'Staff signup is not enabled on this deployment.' });
      }
      const providedCode = cleanString(req.body?.staffCode, { min: 1, max: 128 }) || '';
      // Compare fixed-length digests (not the raw strings) with a
      // constant-time comparison so response timing can't leak how many
      // leading characters of the code were guessed correctly.
      const providedDigest = crypto.createHash('sha256').update(providedCode).digest();
      const expectedDigest = crypto.createHash('sha256').update(ENV.STAFF_SIGNUP_CODE).digest();
      if (!crypto.timingSafeEqual(providedDigest, expectedDigest)) {
        return res.status(403).json({ error: 'Invalid staff signup code.' });
      }
    }
    await ensureDb();
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length) return res.status(409).json({ error: 'An account with this email already exists.' });
    const hash = await bcrypt.hash(password, 12);
    const role = wantsStaff ? 'staff' : 'fan';
    const [user] = await sql`
      INSERT INTO users (email, password_hash, role) VALUES (${email}, ${hash}, ${role})
      RETURNING id, email, role;
    `;
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) { next(err); }
});

router.post('/auth/login', authLimiter, async (req, res, next) => {
  try {
    if (!FEATURES.auth) return res.status(503).json({ error: 'Auth is not configured on this deployment.' });
    const email = cleanString(req.body?.email, { min: 5, max: 254 })?.toLowerCase() || null;
    const password = cleanString(req.body?.password, { min: 1, max: 128 });
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    await ensureDb();
    const [user] = await sql`SELECT id, email, role, password_hash FROM users WHERE email = ${email}`;
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });
    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) { next(err); }
});

router.get('/auth/me', authMiddleware(), (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
