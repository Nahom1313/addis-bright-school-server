import SchoolInfo from '../models/SchoolInfo.js';

class SchoolInfoRepository {
  // Always read/write the singleton document
  async get() {
    return SchoolInfo.findById('singleton');
  }

  async upsert(data) {
    return SchoolInfo.findByIdAndUpdate(
      'singleton',
      { $set: data },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  async addBankAccount(account) {
    return SchoolInfo.findByIdAndUpdate(
      'singleton',
      { $push: { bankAccounts: account } },
      { new: true, runValidators: true }
    );
  }

  async removeBankAccount(index) {
    // MongoDB doesn't support direct array index removal cleanly;
    // we pull by marking then unsetting, so we use a two-step approach.
    const doc = await SchoolInfo.findById('singleton');
    if (!doc) return null;
    doc.bankAccounts.splice(index, 1);
    return doc.save();
  }

  async updateBankAccount(index, updates) {
    const doc = await SchoolInfo.findById('singleton');
    if (!doc || !doc.bankAccounts[index]) return null;
    Object.assign(doc.bankAccounts[index], updates);
    return doc.save();
  }
}

export default new SchoolInfoRepository();
