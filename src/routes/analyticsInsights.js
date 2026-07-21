import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/rbac.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { getAnalyticsOverview, getSectionBreakdown } from '../services/analyticsService.js';
import generateInsightsWithRetry from '../lib/aiAnalyticsInsights.js';

const router = Router();
router.use(protect);

const insightsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => String(req.user?._id || req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many insight requests. Please wait a few minutes before trying again.' },
});

// Simple in-memory cache — school-wide analytics don't meaningfully change
// minute to minute, and this avoids paying for a fresh Groq call every time
// someone opens the Analytics page. Resets on server restart, which is fine.
let cache = { data: null, expiresAt: 0 };
const CACHE_MS = 60 * 60 * 1000; // 1 hour

router.get('/insights', restrictTo('director', 'registrar'), insightsLimiter, async (req, res, next) => {
  try {
    const force = req.query.refresh === 'true';

    if (!force && cache.data && Date.now() < cache.expiresAt) {
      return sendSuccess(res, { ...cache.data, cached: true });
    }

    const [overview, sections] = await Promise.all([
      getAnalyticsOverview(),
      getSectionBreakdown(),
    ]);

    const insights = await generateInsightsWithRetry({ overview, sections });
    const payload = { ...insights, generatedAt: new Date() };

    cache = { data: payload, expiresAt: Date.now() + CACHE_MS };

    sendSuccess(res, { ...payload, cached: false });
  } catch (err) {
    console.error('[AI analytics-insights] Failed:', err.message);
    sendError(res, 'AI insights are temporarily unavailable. Please try again in a moment.', 503);
  }
});

export default router;
