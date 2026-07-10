import { Router } from 'express';
import eventController from '../controllers/eventController.js';
import { protect } from '../middleware/auth.js';
import { isStaff } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { createEventSchema, updateEventSchema } from '../validators/eventValidators.js';

const router = Router();

router.use(protect);

// All authenticated users can read events
router.get('/upcoming', eventController.getUpcoming);  // ?sectionId=xxx
router.get('/',         eventController.getAll);
router.get('/:id',      eventController.getById);

// Staff (director + teacher) can manage events
router.post('/',        isStaff, validate(createEventSchema), eventController.create);
router.patch('/:id',    isStaff, validate(updateEventSchema),  eventController.update);
router.delete('/:id',   isStaff, eventController.delete);

export default router;
