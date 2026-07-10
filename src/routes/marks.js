import { Router } from 'express';
import { saveGrades, getGrades, getStudentMarks, getStudentMarksSummary } from '../controllers/markController.js';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/rbac.js';
import { cacheMiddleware, invalidateCache } from '../config/cache.js';
import { sendSuccess } from '../utils/response.js';
import Mark from '../models/Mark.js';

const router = Router();

router.use(protect);

router.post('/entry', restrictTo('teacher', 'director'), (req, res, next) => {
  // Invalidate cached marks when new grades are saved
  const { entries = [] } = req.body;
  entries.forEach(e => { if (e.studentId) invalidateCache(`marks:student:${e.studentId}`, `marks:summary:${e.studentId}`); });
  next();
}, saveGrades);
router.get('/entry',               restrictTo('teacher', 'director'),  cacheMiddleware(60, req => `marks:entry:${req.user._id}:${req.query.sectionId}`), getGrades);
// FIX: parent can now access child marks (access-checked inside controller)
router.get('/student/:id',         cacheMiddleware(120, req => `marks:student:${req.params.id}`), getStudentMarks);
router.get('/student/:id/summary', cacheMiddleware(120, req => `marks:summary:${req.params.id}`), getStudentMarksSummary);

// GET /api/marks/student/:id/progress — marks grouped by subject for charting
router.get('/student/:id/progress', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, _id: userId } = req.user;

    // Access control: student can only view own, parent must have child, teacher/director open
    if (role === 'student' && String(userId) !== id) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (role === 'parent') {
      const User = (await import('../models/User.js')).default;
      const parent = await User.findById(userId).select('studentIds');
      if (!parent?.studentIds?.map(String).includes(id)) return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const marks = await Mark.find({ studentId: id })
      .sort({ createdAt: 1 })
      .select('subject score maxScore term createdAt')
      .lean();

    // Group by subject
    const bySubject = marks.reduce((acc, m) => {
      if (!acc[m.subject]) acc[m.subject] = [];
      acc[m.subject].push({
        term:      m.term,
        score:     m.score,
        maxScore:  m.maxScore,
        pct:       Math.round((m.score / m.maxScore) * 100),
        date:      m.createdAt,
      });
      return acc;
    }, {});

    // Summary stats per subject
    const subjects = Object.entries(bySubject).map(([subject, entries]) => {
      const pcts = entries.map(e => e.pct);
      return {
        subject,
        entries,
        avg:     Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length),
        highest: Math.max(...pcts),
        lowest:  Math.min(...pcts),
        trend:   pcts.length > 1 ? pcts[pcts.length - 1] - pcts[0] : 0,
      };
    });

    sendSuccess(res, { subjects });
  } catch (err) { next(err); }
});

export default router;

// GET /api/marks/leaderboard?sectionId= — ranked students by avg mark
router.get('/leaderboard', protect, async (req, res, next) => {
  try {
    let { sectionId } = req.query;
    const { role, _id: userId } = req.user;
    const User = (await import('../models/User.js')).default;

    // Students may only see the leaderboard for their own section.
    if (role === 'student') {
      const student = await User.findById(userId).select('sectionId');
      const ownSectionId = student?.sectionId ? String(student.sectionId) : null;
      if (!ownSectionId) return res.json({ success: true, data: { leaderboard: [] } });
      if (sectionId && String(sectionId) !== ownSectionId) {
        return res.status(403).json({ success: false, message: 'You can only view your own section\'s leaderboard.' });
      }
      sectionId = ownSectionId;
    }

    // Parents may only see the leaderboard for a section their child is in.
    if (role === 'parent') {
      const parent = await User.findById(userId).select('studentIds');
      const children = await User.find({ _id: { $in: parent?.studentIds || [] } }).select('sectionId');
      const childSectionIds = children.map(c => String(c.sectionId)).filter(Boolean);
      if (!childSectionIds.length) return res.json({ success: true, data: { leaderboard: [] } });
      if (sectionId) {
        if (!childSectionIds.includes(String(sectionId))) {
          return res.status(403).json({ success: false, message: 'You can only view the leaderboard for your own child\'s section.' });
        }
      } else {
        sectionId = childSectionIds[0];
      }
    }

    // Teacher / director / registrar can view any section, or the whole school if omitted.
    const filter = { role: 'student', isActive: true };
    if (sectionId) filter.sectionId = sectionId;

    const students = await User.find(filter).select('_id firstName lastName studentCode').lean();

    if (!students.length) return res.json({ success: true, data: { leaderboard: [] } });

    const studentIds = students.map(s => s._id);

    const marks = await Mark.aggregate([
      { $match: { studentId: { $in: studentIds } } },
      {
        $group: {
          _id: '$studentId',
          avg: { $avg: { $multiply: [{ $divide: ['$score', '$maxScore'] }, 100] } },
          subjectCount: { $addToSet: '$subject' },
        },
      },
    ]);

    const markMap = marks.reduce((m, r) => {
      m[String(r._id)] = { avg: Math.round(r.avg), subjectCount: r.subjectCount.length };
      return m;
    }, {});

    const leaderboard = students
      .filter(s => markMap[String(s._id)])
      .map(s => ({
        studentId:    s._id,
        firstName:    s.firstName,
        lastName:     s.lastName,
        studentCode:  s.studentCode,
        avg:          markMap[String(s._id)]?.avg ?? 0,
        subjectCount: markMap[String(s._id)]?.subjectCount ?? 0,
      }))
      .sort((a, b) => b.avg - a.avg);

    res.json({ success: true, data: { leaderboard } });
  } catch (err) { next(err); }
});
