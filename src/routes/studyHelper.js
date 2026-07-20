import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import Resource from '../models/Resource.js';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/rbac.js';
import { sendSuccess, sendError } from '../utils/response.js';
import generateStudyHelperReply from '../lib/aiStudyHelper.js';

const router = Router();
router.use(protect);

// Chat naturally has many turns, but each one is a Groq call — cap it
// generously enough for real conversation without allowing unbounded spend.
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  keyGenerator: (req) => String(req.user?._id || req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "You've sent a lot of messages — please wait a few minutes before continuing." },
});

const chatSchema = z.object({
  subject: z.string().min(1).max(100),
  message: z.string().min(1).max(1000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(2000),
  })).max(20).optional().default([]),
});

// ─── GET /api/study-helper/subjects — subjects that have at least one resource, for the picker ───
router.get('/subjects', restrictTo('student'), async (req, res, next) => {
  try {
    const subjects = await Resource.distinct('subject', { isActive: true });
    sendSuccess(res, { subjects: subjects.sort() });
  } catch (err) { next(err); }
});

// ─── POST /api/study-helper/chat — ask a question, grounded in the subject's PDF materials when available ───
router.post('/chat', restrictTo('student'), chatLimiter, async (req, res, next) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed', 422, parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
    }
    const { subject, message, history } = parsed.data;

    // Most recent 3 resources for this subject that actually have extracted
    // text (PDF uploads only) — keeps the prompt a reasonable size.
    const sourceResources = await Resource.find({
      subject, isActive: true, extractedText: { $ne: null },
    }).sort({ createdAt: -1 }).limit(3).select('title extractedText');

    const reply = await generateStudyHelperReply({
      subject,
      message,
      history,
      sourceResources: sourceResources.map(r => ({ title: r.title, extractedText: r.extractedText })),
    });

    sendSuccess(res, { reply, groundedInMaterials: sourceResources.length > 0 });
  } catch (err) {
    console.error('[AI study-helper] Failed:', err.message);
    sendError(res, 'The study helper is temporarily unavailable. Please try again in a moment.', 503);
  }
});

export default router;
