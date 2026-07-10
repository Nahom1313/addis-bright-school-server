import { Router } from 'express';
import { submitAttendance, getBySection, getByStudent } from '../controllers/attendanceController.js';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/rbac.js';

const router = Router();

router.use(protect);

// Teacher submits attendance
router.post('/', restrictTo('teacher', 'director'), submitAttendance);

// Teacher/Director view by section
router.get('/', restrictTo('teacher', 'director'), getBySection);

// Student/Parent/Teacher/Director view by student
router.get('/student/:studentId', getByStudent);

export default router;
