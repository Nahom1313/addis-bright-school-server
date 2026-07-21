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

// ─── Advanced analytics for director/registrar dashboards ─────────
import { getAnalyticsOverview } from '../services/analyticsService.js';

router.get('/analytics/overview', protect, restrictTo('director', 'registrar'), async (req, res, next) => {
  try {
    const data = await getAnalyticsOverview();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});
