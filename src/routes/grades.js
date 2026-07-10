import { Router } from 'express';
import gradeController from '../controllers/gradeController.js';
import { protect } from '../middleware/auth.js';
import { isDirector } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { createGradeSchema, updateGradeSchema } from '../validators/schoolValidators.js';

const router = Router();

// All grade routes require authentication
router.use(protect);

router.get('/',      gradeController.getAll);             // all roles (read)
router.get('/:id',   gradeController.getById);            // all roles (read)
router.post('/',     isDirector, validate(createGradeSchema), gradeController.create);
router.patch('/:id', isDirector, validate(updateGradeSchema), gradeController.update);
router.delete('/:id',isDirector, gradeController.delete);

export default router;
