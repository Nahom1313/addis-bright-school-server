import { Router } from 'express';
import userController from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';
import { isDirector, restrictTo } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import User from '../models/User.js';
import { sendSuccess, sendError } from '../utils/response.js';
import {
  createTeacherSchema, createStudentSchema, createParentSchema,
  updateUserSchema, enrollStudentSchema, linkParentSchema,
  bulkCreateStudentsSchema,
} from '../validators/schoolValidators.js';

const router = Router();

// ─── Named routes first ───────────────────────────────────────────
router.get('/stats',              protect, isDirector, userController.getStats);
router.post('/teachers',          protect, isDirector, validate(createTeacherSchema), userController.createTeacher);
router.post('/students',          protect, isDirector, validate(createStudentSchema), userController.createStudent);
router.post('/students/bulk',     protect, isDirector, validate(bulkCreateStudentsSchema), userController.bulkCreateStudents);
router.post('/parents',           protect, isDirector, validate(createParentSchema), userController.createParent);

// Parent: link child by student code
router.patch('/link-by-code', protect, restrictTo('parent'), async (req, res, next) => {
  try {
    const { studentCode } = req.body;
    if (!studentCode) return sendError(res, 'Student code is required.', 400);
    const student = await User.findOne({ studentCode: studentCode.trim().toUpperCase(), role: 'student', isActive: true });
    if (!student) return sendError(res, `No student found with code "${studentCode}".`, 404);
    const parent = await User.findById(req.user._id);
    if (parent.studentIds?.map(String).includes(String(student._id))) {
      return sendError(res, 'Student already linked.', 409);
    }
    const updated = await User.findByIdAndUpdate(req.user._id, { $addToSet: { studentIds: student._id } }, { new: true }).select('-password');
    sendSuccess(res, { parent: updated, linkedStudent: { firstName: student.firstName, lastName: student.lastName, studentCode: student.studentCode } }, `${student.firstName} linked.`);
  } catch (err) { next(err); }
});

// ─── Dynamic /:id routes ──────────────────────────────────────────
// FIX: registrar needs user search for linking students; teachers need it for messaging
router.get('/',       protect, restrictTo('director', 'registrar', 'teacher', 'parent'), userController.getAll);
router.get('/:id',    protect, restrictTo('director', 'registrar'), userController.getById);
router.patch('/:id',  protect, isDirector, validate(updateUserSchema), userController.update);
router.delete('/:id', protect, isDirector, userController.deactivate);

// Block / Unblock
router.patch('/:id/reactivate',  protect, isDirector, userController.reactivate);

router.patch('/:id/enroll',      protect, isDirector, validate(enrollStudentSchema), userController.enrollStudent);
router.patch('/:id/link-parent', protect, isDirector, validate(linkParentSchema),    userController.linkParent);
// FIX: teachers must be able to fetch their own assignments (homework page, program page)
router.get('/:id/assignments', protect, (req, res, next) => {
  if (req.user.role === 'director' || String(req.user._id) === req.params.id) return next();
  return res.status(403).json({ success: false, message: 'Access denied.' });
}, userController.getTeacherAssignments);

export default router;

// ─── Advanced analytics for director dashboard ────────────────────
import Attendance from '../models/Attendance.js';
import StatusLog  from '../models/StatusLog.js';
import Mark       from '../models/Mark.js';

router.get('/analytics/overview', protect, isDirector, async (req, res, next) => {
  try {
    const User     = (await import('../models/User.js')).default;
    const Section  = (await import('../models/Section.js')).default;

    const now     = new Date();
    const day30   = new Date(now); day30.setDate(day30.getDate() - 30);
    const day7    = new Date(now); day7.setDate(day7.getDate() - 7);

    const [
      totalStudents, totalTeachers, totalParents,
      activeStudents30, newStudents7,
      attendanceStats, logStats, markStats,
      logsByTone, logsByCategory,
    ] = await Promise.all([
      User.countDocuments({ role: 'student', isActive: true }),
      User.countDocuments({ role: 'teacher', isActive: true }),
      User.countDocuments({ role: 'parent',  isActive: true }),
      User.countDocuments({ role: 'student', isActive: true }),
      User.countDocuments({ role: 'student', isActive: true, createdAt: { $gte: day7 } }),

      // Attendance breakdown last 30 days
      Attendance.aggregate([
        { $match: { date: { $gte: day30 } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Log activity last 30 days
      StatusLog.aggregate([
        { $match: { createdAt: { $gte: day30 } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Average marks per subject
      Mark.aggregate([
        {
          $group: {
            _id: '$subject',
            avg: { $avg: { $multiply: [{ $divide: ['$score', '$maxScore'] }, 100] } },
            count: { $sum: 1 },
          },
        },
        { $sort: { avg: -1 } },
        { $limit: 8 },
      ]),

      // Logs by tone
      StatusLog.aggregate([
        { $match: { enriched: true } },
        { $group: { _id: '$tone', count: { $sum: 1 } } },
      ]),

      // Logs by category
      StatusLog.aggregate([
        { $match: { enriched: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    // Reshape attendance
    const attMap = attendanceStats.reduce((m, a) => { m[a._id] = a.count; return m; }, {});
    const totalAtt = Object.values(attMap).reduce((s, v) => s + v, 0);

    res.json({
      success: true,
      data: {
        totals: { students: totalStudents, teachers: totalTeachers, parents: totalParents, newStudents7 },
        attendance: {
          present: attMap.present || 0,
          absent:  attMap.absent  || 0,
          late:    attMap.late    || 0,
          excused: attMap.excused || 0,
          total:   totalAtt,
          rate:    totalAtt > 0 ? Math.round(((attMap.present || 0) / totalAtt) * 100) : null,
        },
        logActivity: logStats.map(l => ({ date: l._id, count: l.count })),
        marksBySubject: markStats.map(m => ({ subject: m._id, avg: Math.round(m.avg), count: m.count })),
        logsByTone:     logsByTone.map(l => ({ tone: l._id, count: l.count })),
        logsByCategory: logsByCategory.map(l => ({ category: l._id, count: l.count })),
      },
    });
  } catch (err) { next(err); }
});
