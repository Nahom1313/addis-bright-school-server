/**
 * rateLimits.js — Tiered rate limiting
 * Different limits for different endpoint sensitivity levels.
 */
import rateLimit from 'express-rate-limit';

const json429 = { success: false, message: 'Too many requests. Please slow down and try again.' };

/** General API — 300 req / 15 min per IP */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: json429,
});

/** Auth endpoints — 20 req / 15 min (brute-force protection) */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please wait 15 minutes.' },
  skipSuccessfulRequests: true, // don't count successful logins
});

/** Password reset — 5 req / hour (prevent email bombing) */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many password reset requests. Try again in an hour.' },
});

/** File upload / bulk import — 10 req / hour */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Upload limit reached. Try again in an hour.' },
});

/** Heavy read endpoints (analytics, leaderboard) — 60 req / min */
export const heavyReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: json429,
});
