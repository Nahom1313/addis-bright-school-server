import sectionRepository from '../repositories/sectionRepository.js';
import gradeRepository from '../repositories/gradeRepository.js';
import teacherAssignmentRepository from '../repositories/teacherAssignmentRepository.js';
import userRepository from '../repositories/userRepository.js';
import { createError } from '../middleware/errorHandler.js';

class SectionService {
  async getAll() {
    return sectionRepository.findAll();
  }

  async getByGrade(gradeId) {
    // Verify grade exists
    const grade = await gradeRepository.findByIdLean(gradeId);
    if (!grade) throw createError('Grade not found.', 404);
    return sectionRepository.findByGrade(gradeId);
  }

  async getById(id) {
    const section = await sectionRepository.findById(id);
    if (!section) throw createError('Section not found.', 404);
    return section;
  }

  async create({ name, gradeId, capacity, room }) {
    // Grade must exist
    const grade = await gradeRepository.findByIdLean(gradeId);
    if (!grade) throw createError('Grade not found.', 404);
    if (!grade.isActive) throw createError('Cannot add a section to an inactive grade.', 409);

    // No duplicate section name within the grade
    const dup = await sectionRepository.exists(gradeId, name);
    if (dup) throw createError(`Section "${name}" already exists in this grade.`, 409);

    return sectionRepository.create({ name, gradeId, capacity, room });
  }

  async update(id, updates) {
    const section = await sectionRepository.findById(id);
    if (!section) throw createError('Section not found.', 404);

    if (updates.name && updates.name !== section.name) {
      const dup = await sectionRepository.exists(section.gradeId, updates.name, id);
      if (dup) throw createError(`Section "${updates.name}" already exists in this grade.`, 409);
    }

    return sectionRepository.updateById(id, updates);
  }

  async delete(id) {
    const section = await sectionRepository.findById(id);
    if (!section) throw createError('Section not found.', 404);

    // Guard: section must be empty
    const students = await userRepository.findStudentsBySection(id);
    if (students.length > 0) {
      throw createError(
        `Cannot delete section "${section.name}" — it has ${students.length} enrolled student(s).`,
        409
      );
    }

    // Remove teacher assignments
    await teacherAssignmentRepository.deactivateBySection(id);
    return sectionRepository.deleteById(id);
  }

  async getStudents(sectionId) {
    const section = await sectionRepository.findById(sectionId);
    if (!section) throw createError('Section not found.', 404);
    return userRepository.findStudentsBySection(sectionId);
  }
}

export default new SectionService();
