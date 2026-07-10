import { Router } from 'express';
import meetingController from '../controllers/meetingController.js';
import { protect } from '../middleware/auth.js';
import { isStaff } from '../middleware/rbac.js';

const router = Router();

router.use(protect);

// All authenticated users can read
router.get('/upcoming', meetingController.getUpcoming);
router.get('/',         meetingController.getAll);
router.get('/:id',      meetingController.getById);

// Only staff (director + teacher) can manage
router.post('/',        isStaff, meetingController.create);
router.patch('/:id',    isStaff, meetingController.update);
router.delete('/:id',   isStaff, meetingController.delete);

export default router;
