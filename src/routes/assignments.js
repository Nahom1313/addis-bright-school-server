import { Router } from 'express';
import teacherAssignmentController from '../controllers/teacherAssignmentController.js';
import { protect } from '../middleware/auth.js';
import { isDirector, isTeacher, isAdmin } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { assignTeacherSchema } from '../validators/schoolValidators.js';
import TeacherAssignment from '../models/TeacherAssignment.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();
router.use(protect);

// Teacher fetches their own assignments
router.get('/mine', isTeacher, async (req, res, next) => {
  try {
    const assignments = await TeacherAssignment.find({ teacherId: req.user._id })
      .populate({ path: 'sectionId', populate: { path: 'gradeId', model: 'Grade' } })
      .lean();
    sendSuccess(res, assignments);
  } catch (err) { next(err); }
});

router.get('/',       isAdmin,    teacherAssignmentController.getAll);
router.post('/',      isDirector, validate(assignTeacherSchema), teacherAssignmentController.assign);
router.delete('/:id', isDirector, teacherAssignmentController.remove);

export default router;
