import { Router } from 'express';
import sectionController from '../controllers/sectionController.js';
import { protect } from '../middleware/auth.js';
import { isDirector, isStaff, restrictTo } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { createSectionSchema, updateSectionSchema } from '../validators/schoolValidators.js';

const router = Router();

router.use(protect);

router.get('/',                    sectionController.getAll);              // all roles
router.get('/grade/:gradeId',      sectionController.getByGrade);          // all roles
router.get('/:id',                 sectionController.getById);             // all roles
router.get('/:id/students',        restrictTo('director', 'teacher', 'registrar'), sectionController.getStudents);
router.post('/',                   isDirector, validate(createSectionSchema), sectionController.create);
router.patch('/:id',               isDirector, validate(updateSectionSchema), sectionController.update);
router.delete('/:id',              isDirector, sectionController.delete);

export default router;
