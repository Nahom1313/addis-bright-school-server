import userRepository from '../repositories/userRepository.js';
import sectionRepository from '../repositories/sectionRepository.js';
import teacherAssignmentRepository from '../repositories/teacherAssignmentRepository.js';
import { createError } from '../middleware/errorHandler.js';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

async function generateStudentCode() {
  const { default: mongoose } = await import('mongoose');
  const Counter = mongoose.models.Counter || mongoose.model('Counter', new mongoose.Schema({
    _id: String,
    seq: { type: Number, default: 0 },
  }));
  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `studentCode_${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return `STU-${year}-${String(counter.seq).padStart(3, '0')}`;
}

class UserService {
  // ─── Generic ──────────────────────────────────────────────────
  async getAll(role = null, { page = 1, limit = 50 } = {}) {
    const skip = (page - 1) * limit;
    const { default: User } = await import('../models/User.js');
    const filter = role ? { role, isActive: true } : { isActive: true };
    const [users, total] = await Promise.all([
      User.find(filter).select('-password').sort({ lastName: 1, firstName: 1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);
    return { users, total, page, limit };
  }

  // For settings — returns ALL users including deactivated, with pagination
  async getAllIncluding(role, { page = 1, limit = 100 } = {}) {
    const skip = (page - 1) * limit;
    const { default: User } = await import('../models/User.js');
    const filter = role ? { role } : {};
    const [users, total] = await Promise.all([
      User.find(filter).select('-password').sort({ isActive: -1, lastName: 1, firstName: 1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);
    return { users, total, page, limit };
  }

  async getById(id) {
    const user = await userRepository.findById(id);
    if (!user) throw createError('User not found.', 404);
    return user;
  }

  async update(id, updates) {
    const { password, role, ...safeUpdates } = updates;

    // If a new email is provided, check it isn't already taken by another user
    if (safeUpdates.email) {
      const existing = await User.findOne({ email: safeUpdates.email.toLowerCase(), _id: { $ne: id } });
      if (existing) throw createError('This email is already in use by another account.', 409);
      safeUpdates.email = safeUpdates.email.toLowerCase();
    }

    // Hash password before saving if provided
    if (password) {
      safeUpdates.password = await bcrypt.hash(password, 12);
    }

    const user = await userRepository.updateById(id, safeUpdates);
    if (!user) throw createError('User not found.', 404);
    return user;
  }

  async deactivate(id, requesterId) {
    if (id === requesterId) throw createError('You cannot deactivate your own account.', 400);
    const user = await userRepository.deactivateById(id);
    if (!user) throw createError('User not found.', 404);
    if (user.role === 'teacher') {
      await teacherAssignmentRepository.deactivateByTeacher(id);
    }
    return user;
  }

  // Reactivate a previously blocked user
  async reactivate(id, requesterId) {
    if (id === requesterId) throw createError('Cannot modify your own account.', 400);
    const user = await userRepository.reactivateById(id);
    if (!user) throw createError('User not found.', 404);
    return user;
  }

  // ─── Teachers ─────────────────────────────────────────────────
  async createTeacher(data) {
    const exists = await userRepository.emailExists(data.email);
    if (exists) throw createError('An account with this email already exists.', 409);
    return userRepository.create({ ...data, role: 'teacher' });
  }

  async getTeachers() {
    return userRepository.findByRole('teacher');
  }

  async getTeacherAssignments(teacherId) {
    const teacher = await userRepository.findById(teacherId);
    if (!teacher || teacher.role !== 'teacher') throw createError('Teacher not found.', 404);
    return teacherAssignmentRepository.findByTeacher(teacherId);
  }

  // ─── Students ─────────────────────────────────────────────────
  async createStudent(data) {
    const { sectionId } = data;
    if (sectionId) {
      const section = await sectionRepository.findById(sectionId);
      if (!section) throw createError('Section not found.', 404);
    }
    const exists = await userRepository.emailExists(data.email);
    if (exists) throw createError('An account with this email already exists.', 409);
    if (!data.studentCode) {
      data.studentCode = await generateStudentCode();
    }
    return userRepository.create({ ...data, role: 'student' });
  }

  async bulkCreateStudents(rows) {
    const results = [];
    for (const row of rows) {
      try {
        const student = await this.createStudent(row);
        results.push({ ok: true, student, email: row.email });
      } catch (err) {
        results.push({ ok: false, email: row.email, error: err.message });
      }
    }
    return results;
  }

  async enrollStudentInSection(studentId, sectionId) {
    const student = await userRepository.findById(studentId);
    if (!student || student.role !== 'student') throw createError('Student not found.', 404);
    const section = await sectionRepository.findById(sectionId);
    if (!section) throw createError('Section not found.', 404);
    return userRepository.updateById(studentId, { sectionId });
  }

  // ─── Parents ──────────────────────────────────────────────────
  async createParent(data) {
    const { studentIds = [] } = data;
    for (const sid of studentIds) {
      const student = await userRepository.findById(sid);
      if (!student || student.role !== 'student') throw createError(`Student "${sid}" not found.`, 404);
    }
    const exists = await userRepository.emailExists(data.email);
    if (exists) throw createError('An account with this email already exists.', 409);
    return userRepository.create({ ...data, role: 'parent', studentIds });
  }

  async linkParentToStudent(parentId, studentId) {
    const parent = await userRepository.findById(parentId);
    if (!parent || parent.role !== 'parent') throw createError('Parent not found.', 404);
    const student = await userRepository.findById(studentId);
    if (!student || student.role !== 'student') throw createError('Student not found.', 404);
    if (parent.studentIds?.map(String).includes(String(studentId))) throw createError('Already linked.', 409);
    const { default: User } = await import('../models/User.js');
    return User.findByIdAndUpdate(parentId, { $addToSet: { studentIds: studentId } }, { new: true }).select('-password');
  }

  // ─── Analytics ────────────────────────────────────────────────
  async getSchoolStats() {
    const { default: User }    = await import('../models/User.js');
    const { default: Section } = await import('../models/Section.js');
    const { default: Grade }   = await import('../models/Grade.js');
    const { default: TeacherAssignment } = await import('../models/TeacherAssignment.js');

    const [students, teachers, parents, sections, grades, assignments] = await Promise.all([
      User.countDocuments({ role: 'student', isActive: true }),
      User.countDocuments({ role: 'teacher', isActive: true }),
      User.countDocuments({ role: 'parent',  isActive: true }),
      Section.countDocuments({ isActive: true }),
      Grade.countDocuments({ isActive: true }),
      TeacherAssignment.countDocuments({ isActive: true }),
    ]);

    return { students, teachers, parents, sections, grades, assignments };
  }
}

export default new UserService();
