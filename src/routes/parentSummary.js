import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import Mark from '../models/Mark.js';
import Attendance from '../models/Attendance.js';
import StatusLog from '../models/StatusLog.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/rbac.js';
import { sendSuccess, sendError } from '../utils/response.js';
import generateParentSummaryWithRetry from '../lib/aiParentSummary.js';

const router = Router();
router.use(protect);

// Dedicated limiter — protects Groq API spend on this heavier, multi-source call.
const summaryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => String(req.user?._id || req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many summary requests. Please wait a few minutes before trying again.' },
});

// ─── GET /api/parent-summary/:studentId — AI summary of a child's recent progress ───
router.get('/:studentId', restrictTo('parent'), summaryLimiter, async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const lang = req.query.lang === 'am' ? 'am' : 'en';

    // Ownership check — a parent can only summarize their own linked children.
    // Never trust the URL param alone; this is the exact IDOR pattern to guard against.
    const isOwnChild = (req.user.studentIds || []).some(id => String(id) === String(studentId));
    if (!isOwnChild) {
      return sendError(res, 'You can only view summaries for your own children.', 403);
    }

    const student = await User.findOne({ _id: studentId, role: 'student' }).select('firstName lastName');
    if (!student) return sendError(res, 'Student not found.', 404);

    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [marksAgg, attendanceRecords, recentLogs] = await Promise.all([
      Mark.aggregate([
        { $match: { studentId: student._id } },
        { $group: { _id: '$subject', avgScore: { $avg: '$score' }, avgMax: { $avg: '$maxScore' }, count: { $sum: 1 } } },
      ]),
      Attendance.find({ studentId: student._id, date: { $gte: since90 } }).select('status'),
      StatusLog.find({ studentId: student._id, enriched: true }).sort({ createdAt: -1 }).limit(5).select('summary tone category'),
    ]);

    const marksBySubject = marksAgg.map(m => ({
      subject: m._id,
      avgPct: m.avgMax > 0 ? Math.round((m.avgScore / m.avgMax) * 100) : 0,
      count: m.count,
    })).sort((a, b) => b.count - a.count);

    const attendance = {
      total:    attendanceRecords.length,
      present:  attendanceRecords.filter(a => a.status === 'present').length,
      absent:   attendanceRecords.filter(a => a.status === 'absent').length,
      late:     attendanceRecords.filter(a => a.status === 'late').length,
      excused:  attendanceRecords.filter(a => a.status === 'excused').length,
      rate: 0,
    };
    if (attendance.total > 0) {
      attendance.rate = Math.round(((attendance.present + attendance.late) / attendance.total) * 100);
    }

    const summary = await generateParentSummaryWithRetry({
      studentName: student.firstName,
      marksBySubject,
      attendance,
      recentLogs: recentLogs.map(l => ({ summary: l.summary, tone: l.tone, category: l.category })),
      lang,
    });

    sendSuccess(res, { summary, generatedAt: new Date() });
  } catch (err) {
    console.error('[AI parent-summary] Failed:', err.message);
    sendError(res, 'The AI summary is temporarily unavailable. Please try again in a moment.', 503);
  }
});

export default router;
