import schoolInfoService from '../services/schoolInfoService.js';
import { sendSuccess } from '../utils/response.js';

class SchoolInfoController {
  // GET /api/school  — accessible to all authenticated users
  async get(req, res, next) {
    try {
      const info = await schoolInfoService.get();
      sendSuccess(res, { info });
    } catch (e) { next(e); }
  }

  // PATCH /api/school  — Director only
  async update(req, res, next) {
    try {
      const info = await schoolInfoService.update(req.body);
      sendSuccess(res, { info }, 'School info updated.');
    } catch (e) { next(e); }
  }

  // POST /api/school/bank-accounts
  async addBankAccount(req, res, next) {
    try {
      const info = await schoolInfoService.addBankAccount(req.body);
      sendSuccess(res, { info }, 'Bank account added.', 201);
    } catch (e) { next(e); }
  }

  // DELETE /api/school/bank-accounts/:index
  async removeBankAccount(req, res, next) {
    try {
      const info = await schoolInfoService.removeBankAccount(Number(req.params.index));
      sendSuccess(res, { info }, 'Bank account removed.');
    } catch (e) { next(e); }
  }

  // PATCH /api/school/bank-accounts/:index
  async updateBankAccount(req, res, next) {
    try {
      const info = await schoolInfoService.updateBankAccount(Number(req.params.index), req.body);
      sendSuccess(res, { info }, 'Bank account updated.');
    } catch (e) { next(e); }
  }
}

export default new SchoolInfoController();
