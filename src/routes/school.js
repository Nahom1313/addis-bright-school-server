import { Router } from 'express';
import schoolInfoController from '../controllers/schoolInfoController.js';
import { protect } from '../middleware/auth.js';
import { isDirector } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { updateSchoolInfoSchema, bankAccountSchema } from '../validators/schoolValidators.js';

const router = Router();

router.use(protect);

router.get('/',                          schoolInfoController.get);    // all roles can read
router.patch('/',       isDirector, validate(updateSchoolInfoSchema),  schoolInfoController.update);

// Bank accounts — Director only
router.post('/bank-accounts',   isDirector, validate(bankAccountSchema),  schoolInfoController.addBankAccount);
router.patch('/bank-accounts/:index', isDirector, validate(bankAccountSchema.partial()), schoolInfoController.updateBankAccount);
router.delete('/bank-accounts/:index',isDirector, schoolInfoController.removeBankAccount);

export default router;
