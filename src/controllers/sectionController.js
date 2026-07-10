import sectionService from '../services/sectionService.js';
import { sendSuccess } from '../utils/response.js';

class SectionController {
  async getAll(req, res, next) {
    try {
      const sections = await sectionService.getAll();
      sendSuccess(res, { sections });
    } catch (e) { next(e); }
  }

  async getByGrade(req, res, next) {
    try {
      const sections = await sectionService.getByGrade(req.params.gradeId);
      sendSuccess(res, { sections });
    } catch (e) { next(e); }
  }

  async getById(req, res, next) {
    try {
      const section = await sectionService.getById(req.params.id);
      sendSuccess(res, { section });
    } catch (e) { next(e); }
  }

  async create(req, res, next) {
    try {
      const section = await sectionService.create(req.body);
      sendSuccess(res, { section }, 'Section created.', 201);
    } catch (e) { next(e); }
  }

  async update(req, res, next) {
    try {
      const section = await sectionService.update(req.params.id, req.body);
      sendSuccess(res, { section }, 'Section updated.');
    } catch (e) { next(e); }
  }

  async delete(req, res, next) {
    try {
      await sectionService.delete(req.params.id);
      sendSuccess(res, {}, 'Section deactivated.');
    } catch (e) { next(e); }
  }

  async getStudents(req, res, next) {
    try {
      const students = await sectionService.getStudents(req.params.id);
      sendSuccess(res, { students });
    } catch (e) { next(e); }
  }
}

export default new SectionController();
