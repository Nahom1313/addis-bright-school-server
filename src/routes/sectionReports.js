import { Router } from 'express';
import Section       from '../models/Section.js';
import SectionReport from '../models/SectionReport.js';
import Mark          from '../models/Mark.js';
import User          from '../models/User.js';
import Attendance    from '../models/Attendance.js';
import { protect }   from '../middleware/auth.js';
import { restrictTo } from '../middleware/rbac.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { notify } from '../lib/notify.js';

const router = Router();
router.use(protect);

// ─── Helper: check if user is class leader of a section ───────────
async function getLeaderSection(teacherId) {
  return Section.findOne({ classLeaderId: teacherId, isActive: true })
    .populate('gradeId', 'name level');
}

// ─── REGISTRAR: assign class leader to a section ──────────────────
// PATCH /api/section-reports/assign-leader
router.patch('/assign-leader', restrictTo('registrar', 'director'), async (req, res, next) => {
  try {
    const { sectionId, teacherId } = req.body;
    if (!sectionId) return sendError(res, 'sectionId is required.', 400);

    // Remove existing class leader assignment from this section first
    await Section.findByIdAndUpdate(sectionId, { classLeaderId: teacherId || null });

    const section = await Section.findById(sectionId)
      .populate('gradeId', 'name')
      .populate('classLeaderId', 'firstName lastName');

    sendSuccess(res, { section }, teacherId ? 'Class leader assigned.' : 'Class leader removed.');
  } catch (e) { next(e); }
});

// ─── CLASS LEADER: get their section + all students data ──────────
// GET /api/section-reports/my-section
router.get('/my-section', restrictTo('teacher'), async (req, res, next) => {
  try {
    const section = await getLeaderSection(req.user._id);
    if (!section) return sendError(res, 'You are not assigned as a class leader of any section.', 403);

    // All students in this section
    const students = await User.find({ sectionId: section._id, role: 'student', isActive: true })
      .select('firstName lastName studentCode profilePicture')
      .sort({ lastName: 1 });

    // All marks for this section
    const marks = await Mark.find({ sectionId: section._id })
      .select('studentId subject score maxScore term')
      .lean();

    // Attendance summary per student
    const attendance = await Attendance.find({ sectionId: section._id })
      .select('studentId status')
      .lean();

    // Build per-student attendance counts
    const attMap = attendance.reduce((m, a) => {
      if (!m[a.studentId]) m[a.studentId] = { total: 0, present: 0 };
      m[a.studentId].total++;
      if (a.status === 'present') m[a.studentId].present++;
      return m;
    }, {});

    // Build per-student marks map
    const marksMap = marks.reduce((m, mk) => {
      const sid = String(mk.studentId);
      if (!m[sid]) m[sid] = [];
      m[sid].push(mk);
      return m;
    }, {});

    // Compose enriched students with avg and rank
    const enriched = students.map(s => {
      const sid = String(s._id);
      const sMarks = marksMap[sid] || [];
      const avgPct = sMarks.length
        ? Math.round(sMarks.reduce((sum, m) => sum + (m.score / m.maxScore) * 100, 0) / sMarks.length)
        : null;
      const att = attMap[sid] || { total: 0, present: 0 };
      return {
        _id:             s._id,
        firstName:       s.firstName,
        lastName:        s.lastName,
        studentCode:     s.studentCode,
        profilePicture:  s.profilePicture,
        marks:           sMarks,
        avgPct,
        attendanceTotal: att.total,
        attendantDays:   att.present,
      };
    }).sort((a, b) => (b.avgPct ?? -1) - (a.avgPct ?? -1))
      .map((s, i) => ({ ...s, rank: i + 1 }));

    sendSuccess(res, { section, students: enriched });
  } catch (e) { next(e); }
});

// ─── CLASS LEADER: submit report to registrar ─────────────────────
// POST /api/section-reports/submit
router.post('/submit', restrictTo('teacher'), async (req, res, next) => {
  try {
    const section = await getLeaderSection(req.user._id);
    if (!section) return sendError(res, 'You are not a class leader.', 403);

    const { term, note } = req.body;
    if (!term) return sendError(res, 'Term is required.', 400);

    // Check no pending report already for this term
    const existing = await SectionReport.findOne({
      sectionId: section._id, term, status: 'pending'
    });
    if (existing) return sendError(res, `A pending report for ${term} already exists.`, 409);

    // Build snapshot
    const students = await User.find({ sectionId: section._id, role: 'student', isActive: true })
      .select('firstName lastName studentCode');
    const marks = await Mark.find({ sectionId: section._id }).lean();
    const attendance = await Attendance.find({ sectionId: section._id }).lean();

    const attMap = attendance.reduce((m, a) => {
      if (!m[a.studentId]) m[a.studentId] = { total: 0, present: 0 };
      m[a.studentId].total++;
      if (a.status === 'present') m[a.studentId].present++;
      return m;
    }, {});

    const marksMap = marks.reduce((m, mk) => {
      const sid = String(mk.studentId);
      if (!m[sid]) m[sid] = [];
      m[sid].push({ subject: mk.subject, score: mk.score, maxScore: mk.maxScore, term: mk.term, pct: Math.round((mk.score / mk.maxScore) * 100) });
      return m;
    }, {});

    const snapshots = students.map(s => {
      const sid    = String(s._id);
      const sMarks = marksMap[sid] || [];
      const avgPct = sMarks.length ? Math.round(sMarks.reduce((sum, m) => sum + m.pct, 0) / sMarks.length) : null;
      const att    = attMap[sid] || { total: 0, present: 0 };
      return { studentId: s._id, firstName: s.firstName, lastName: s.lastName, studentCode: s.studentCode, marks: sMarks, avgPct, attendanceTotal: att.total, attendantDays: att.present };
    }).sort((a, b) => (b.avgPct ?? -1) - (a.avgPct ?? -1))
      .map((s, i) => ({ ...s, rank: i + 1 }));

    const report = await SectionReport.create({
      sectionId:     section._id,
      classLeaderId: req.user._id,
      term,
      note:          note || null,
      students:      snapshots,
      status:        'pending',
    });

    // Notify all registrars
    const registrars = await User.find({ role: 'registrar', isActive: true }).select('_id');
    await Promise.all(registrars.map(r => notify(r._id, {
      type:  'section_report',
      title: `New section report submitted`,
      body:  `${req.user.firstName} ${req.user.lastName} submitted a report for ${section.gradeId?.name} — Section ${section.name} (${term})`,
      link:  '/registrar/section-reports',
    })));

    sendSuccess(res, { report }, 'Report submitted successfully.', 201);
  } catch (e) { next(e); }
});

// ─── CLASS LEADER: get their submitted reports ────────────────────
// GET /api/section-reports/my-reports
router.get('/my-reports', restrictTo('teacher'), async (req, res, next) => {
  try {
    const reports = await SectionReport.find({ classLeaderId: req.user._id })
      .populate('sectionId', 'name gradeId')
      .populate({ path: 'sectionId', populate: { path: 'gradeId', select: 'name' } })
      .populate('reviewedBy', 'firstName lastName')
      .sort({ createdAt: -1 });
    sendSuccess(res, { reports });
  } catch (e) { next(e); }
});

// ─── REGISTRAR: get all submitted reports ─────────────────────────
// GET /api/section-reports
router.get('/', restrictTo('registrar', 'director'), async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const reports = await SectionReport.find(filter)
      .populate('sectionId', 'name gradeId')
      .populate({ path: 'sectionId', populate: { path: 'gradeId', select: 'name' } })
      .populate('classLeaderId', 'firstName lastName')
      .populate('reviewedBy',    'firstName lastName')
      .sort({ createdAt: -1 });
    sendSuccess(res, { reports });
  } catch (e) { next(e); }
});

// ─── REGISTRAR: get single report detail ─────────────────────────
// GET /api/section-reports/:id
router.get('/:id', restrictTo('registrar', 'director', 'teacher'), async (req, res, next) => {
  try {
    const report = await SectionReport.findById(req.params.id)
      .populate('sectionId', 'name gradeId')
      .populate({ path: 'sectionId', populate: { path: 'gradeId', select: 'name' } })
      .populate('classLeaderId', 'firstName lastName')
      .populate('reviewedBy',    'firstName lastName');
    if (!report) return sendError(res, 'Report not found.', 404);

    // Teachers can only view their own reports
    if (req.user.role === 'teacher' && String(report.classLeaderId._id) !== String(req.user._id)) {
      return sendError(res, 'Access denied.', 403);
    }
    sendSuccess(res, { report });
  } catch (e) { next(e); }
});

// ─── REGISTRAR: approve or reject ─────────────────────────────────
// PATCH /api/section-reports/:id/review
router.patch('/:id/review', restrictTo('registrar', 'director'), async (req, res, next) => {
  try {
    const { status, feedback } = req.body;
    if (!['approved', 'rejected'].includes(status)) return sendError(res, 'Status must be approved or rejected.', 400);

    const report = await SectionReport.findById(req.params.id);
    if (!report) return sendError(res, 'Report not found.', 404);
    if (report.status !== 'pending') return sendError(res, 'Report has already been reviewed.', 409);

    report.status     = status;
    report.feedback   = feedback || null;
    report.reviewedBy = req.user._id;
    report.reviewedAt = new Date();
    await report.save();

    // Notify the class leader
    const section = await Section.findById(report.sectionId).populate('gradeId', 'name');
    await notify(report.classLeaderId, {
      type:  'section_report',
      title: `Report ${status}`,
      body:  `Your report for ${section?.gradeId?.name} — Section ${section?.name} (${report.term}) was ${status}${feedback ? ': ' + feedback.slice(0, 80) : '.'}`,
      link:  '/teacher/section-report',
    });

    sendSuccess(res, { report }, `Report ${status}.`);
  } catch (e) { next(e); }
});

export default router;
