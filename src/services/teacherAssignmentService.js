import teacherAssignmentRepository from '../repositories/teacherAssignmentRepository.js';
import userRepository from '../repositories/userRepository.js';
import sectionRepository from '../repositories/sectionRepository.js';
import { createError } from '../middleware/errorHandler.js';

class TeacherAssignmentService {
  async assign({ teacherId, sectionId, subject, academicYear }) {
    // Validate teacher
    const teacher = await userRepository.findById(teacherId);
    if (!teacher || teacher.role !== 'teacher') throw createError('Teacher not found.', 404);
    if (!teacher.isActive) throw createError('Cannot assign an inactive teacher.', 409);

    // Validate section
    const section = await sectionRepository.findById(sectionId);
    if (!section) throw createError('Section not found.', 404);

    try {
      return await teacherAssignmentRepository.create({ teacherId, sectionId, subject, academicYear });
    } catch (err) {
      if (err.code === 11000) {
        throw createError(
          `${teacher.firstName} ${teacher.lastName} is already assigned to teach "${subject}" in this section for ${academicYear}.`,
          409
        );
      }
      throw err;
    }
  }

  async getByTeacher(teacherId) {
    return teacherAssignmentRepository.findByTeacher(teacherId);
  }

  async getBySection(sectionId) {
    return teacherAssignmentRepository.findBySection(sectionId);
  }

  async getAll() {
    return teacherAssignmentRepository.findAll();
  }

  async remove(assignmentId) {
    const assignment = await teacherAssignmentRepository.findById(assignmentId);
    if (!assignment) throw createError('Assignment not found.', 404);
    return teacherAssignmentRepository.deleteById(assignmentId);
  }
}

export default new TeacherAssignmentService();
