import teacherAssignmentService from '../services/teacherAssignmentService.js';
import { sendSuccess } from '../utils/response.js';

class TeacherAssignmentController {
  async getAll(req, res, next) {
    try {
      const assignments = await teacherAssignmentService.getAll();
      sendSuccess(res, { assignments });
    } catch (e) { next(e); }
  }

  async assign(req, res, next) {
    try {
      const assignment = await teacherAssignmentService.assign(req.body);
      sendSuccess(res, { assignment }, 'Teacher assigned successfully.', 201);
    } catch (e) { next(e); }
  }

  async remove(req, res, next) {
    try {
      await teacherAssignmentService.remove(req.params.id);
      sendSuccess(res, {}, 'Assignment removed.');
    } catch (e) { next(e); }
  }
}

export default new TeacherAssignmentController();
