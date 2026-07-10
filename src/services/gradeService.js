import gradeRepository from '../repositories/gradeRepository.js';
import sectionRepository from '../repositories/sectionRepository.js';
import { createError } from '../middleware/errorHandler.js';

class GradeService {
  async getAll() {
    return gradeRepository.findAll(true);
  }

  async getById(id) {
    const grade = await gradeRepository.findById(id);
    if (!grade) throw createError('Grade not found.', 404);
    return grade;
  }

  async create({ name, level, description }) {
    const exists = await gradeRepository.nameExists(name);
    if (exists) throw createError(`A grade named "${name}" already exists.`, 409);
    return gradeRepository.create({ name, level, description });
  }

  async update(id, updates) {
    const grade = await gradeRepository.findByIdLean(id);
    if (!grade) throw createError('Grade not found.', 404);

    if (updates.name && updates.name !== grade.name) {
      const exists = await gradeRepository.nameExists(updates.name, id);
      if (exists) throw createError(`A grade named "${updates.name}" already exists.`, 409);
    }

    return gradeRepository.updateById(id, updates);
  }

  async delete(id) {
    const grade = await gradeRepository.findByIdLean(id);
    if (!grade) throw createError('Grade not found.', 404);

    // Check for active sections before deleting
    const sections = await sectionRepository.findByGrade(id);
    if (sections.length > 0) {
      throw createError(
        `Cannot delete grade "${grade.name}" — it has ${sections.length} active section(s). Delete or reassign them first.`,
        409
      );
    }

    return gradeRepository.deleteById(id);
  }
}

export default new GradeService();
