import gradeService from '../services/gradeService.js';
import { sendSuccess } from '../utils/response.js';

class GradeController {
  async getAll(req, res, next) {
    try {
      const grades = await gradeService.getAll();
      sendSuccess(res, { grades });
    } catch (e) { next(e); }
  }

  async getById(req, res, next) {
    try {
      const grade = await gradeService.getById(req.params.id);
      sendSuccess(res, { grade });
    } catch (e) { next(e); }
  }

  async create(req, res, next) {
    try {
      const grade = await gradeService.create(req.body);
      sendSuccess(res, { grade }, 'Grade created successfully.', 201);
    } catch (e) { next(e); }
  }

  async update(req, res, next) {
    try {
      const grade = await gradeService.update(req.params.id, req.body);
      sendSuccess(res, { grade }, 'Grade updated.');
    } catch (e) { next(e); }
  }

  async delete(req, res, next) {
    try {
      await gradeService.delete(req.params.id);
      sendSuccess(res, {}, 'Grade deactivated.');
    } catch (e) { next(e); }
  }
}

export default new GradeController();
