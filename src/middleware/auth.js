'use strict';

// ----------------------------------------------------------------------------
// >>> NEON AUTH INTEGRATION POINT <<<
// If you have your own Neon Auth (Stack Auth) code, this is where it plugs
// in. Replace the body of `signToken` and `authMiddleware` below (and the
// signup/login handlers in ../routes/auth.js) with calls into
// @stackframe/stack (or your existing Stack Auth handlers), using
// STACK_PROJECT_ID / STACK_PUBLISHABLE_CLIENT_KEY / STACK_SECRET_SERVER_KEY
// from ../config/env. Everything else in this app (routes, GenAI calls, DB
// tables) is agnostic to which auth backend issues the session, as long as
// `authMiddleware` still attaches `req.user = { id, email, role }` on
// success.
// ----------------------------------------------------------------------------

const jwt = require('jsonwebtoken');
const { ENV, FEATURES } = require('../config/env');

/** Signs a 12-hour session token carrying the user's id/email/role. */
function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    ENV.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

/**
 * Express middleware factory. With no arguments, just requires a valid
 * bearer token. With `requiredRole`, additionally requires the token's role
 * to match (an `admin` role always passes).
 */
function authMiddleware(requiredRole) {
  return (req, res, next) => {
    if (!FEATURES.auth) {
      return res.status(503).json({ error: 'Auth is not configured on this deployment.' });
    }
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token.' });
    try {
      const payload = jwt.verify(token, ENV.JWT_SECRET);
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
      if (requiredRole && req.user.role !== requiredRole && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Insufficient permissions.' });
      }
      return next();
    } catch (_err) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
  };
}

module.exports = { signToken, authMiddleware };
