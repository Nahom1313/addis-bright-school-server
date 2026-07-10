import schoolInfoRepository from '../repositories/schoolInfoRepository.js';
import { createError } from '../middleware/errorHandler.js';

class SchoolInfoService {
  async get() {
    const info = await schoolInfoRepository.get();
    if (!info) {
      // Return empty shell if not yet configured
      return {
        schoolName: 'School Name Not Set',
        bankAccounts: [],
        currentAcademicYear: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
      };
    }
    return info;
  }

  async update(data) {
    // Strip bankAccounts — managed via dedicated endpoints
    const { bankAccounts, ...safeData } = data;
    return schoolInfoRepository.upsert(safeData);
  }

  async addBankAccount(account) {
    return schoolInfoRepository.addBankAccount(account);
  }

  async removeBankAccount(index) {
    const result = await schoolInfoRepository.removeBankAccount(index);
    if (!result) throw createError('Bank account not found.', 404);
    return result;
  }

  async updateBankAccount(index, updates) {
    const result = await schoolInfoRepository.updateBankAccount(index, updates);
    if (!result) throw createError('Bank account not found.', 404);
    return result;
  }
}

export default new SchoolInfoService();
