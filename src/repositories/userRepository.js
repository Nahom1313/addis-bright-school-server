import User from '../models/User.js';

class UserRepository {
  async findByEmail(email, includePassword = false) {
    const query = User.findOne({ email: email.toLowerCase() });
    if (includePassword) query.select('+password');
    return query.lean(false);
  }

  async findById(id, select = '-password') {
    return User.findById(id).select(select)
      .populate('sectionId', 'name gradeId')
      .populate({ path: 'sectionId', populate: { path: 'gradeId', select: 'name level' } })
      .populate('studentIds', 'firstName lastName studentCode sectionId');
  }

  async create(data) {
    return User.create(data);
  }

  async updateById(id, updates) {
    return User.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
      .select('-password')
      .populate('sectionId', 'name gradeId')
      .populate({ path: 'sectionId', populate: { path: 'gradeId', select: 'name level' } })
      .populate('studentIds', 'firstName lastName studentCode sectionId');
  }

  async deactivateById(id) {
    return User.findByIdAndUpdate(id, { isActive: false }, { new: true }).select('-password');
  }

  // FIX: Reactivate a blocked user
  async reactivateById(id) {
    return User.findByIdAndUpdate(id, { isActive: true }, { new: true }).select('-password');
  }

  async findByRole(role) {
    return User.find({ role, isActive: true }).select('-password').sort({ lastName: 1, firstName: 1 });
  }

  // Find ALL users by role including inactive (for settings page)
  async findByRoleAll(role) {
    return User.find({ role }).select('-password').sort({ isActive: -1, lastName: 1, firstName: 1 });
  }

  async emailExists(email) {
    return User.exists({ email: email.toLowerCase() });
  }

  async touchLogin(id) {
    return User.findByIdAndUpdate(id, { lastLoginAt: new Date() });
  }

  async findParentsOfStudent(studentId) {
    return User.find({ role: 'parent', studentIds: studentId, isActive: true }).select('-password');
  }

  async findStudentsBySection(sectionId) {
    return User.find({ role: 'student', sectionId, isActive: true })
      .select('-password')
      .sort({ lastName: 1, firstName: 1 });
  }
}

export default new UserRepository();
