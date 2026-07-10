import userService from '../services/userService.js';
import { sendSuccess } from '../utils/response.js';
import { audit } from '../lib/audit.js';

class UserController {
  async getAll(req, res, next) {
    try {
      const { role, page = 1, limit = 50, includeInactive } = req.query;
      const result = includeInactive === 'true'
        ? await userService.getAllIncluding(role || null, { page: Number(page), limit: Math.min(Number(limit), 200) })
        : await userService.getAll(role || null, { page: Number(page), limit: Math.min(Number(limit), 200) });
      sendSuccess(res, result);
    } catch (e) { next(e); }
  }

  async getById(req, res, next) {
    try {
      const user = await userService.getById(req.params.id);
      sendSuccess(res, { user });
    } catch (e) { next(e); }
  }

  async update(req, res, next) {
    try {
      const user = await userService.update(req.params.id, req.body);
      audit(req, 'UPDATE_USER', 'User', req.params.id, req.body);
      sendSuccess(res, { user }, 'User updated.');
    } catch (e) { next(e); }
  }

  async deactivate(req, res, next) {
    try {
      const user = await userService.deactivate(req.params.id, req.user._id.toString());
      audit(req, 'DEACTIVATE_USER', 'User', req.params.id, { role: user.role });
      sendSuccess(res, { user }, 'User blocked.');
    } catch (e) { next(e); }
  }

  async reactivate(req, res, next) {
    try {
      const user = await userService.reactivate(req.params.id, req.user._id.toString());
      audit(req, 'REACTIVATE_USER', 'User', req.params.id, { role: user.role });
      sendSuccess(res, { user }, 'User unblocked.');
    } catch (e) { next(e); }
  }

  async getStats(req, res, next) {
    try {
      const stats = await userService.getSchoolStats();
      sendSuccess(res, { stats });
    } catch (e) { next(e); }
  }

  async createTeacher(req, res, next) {
    try {
      const user = await userService.createTeacher(req.body);
      audit(req, 'CREATE_USER', 'User', user._id, { role: 'teacher', email: user.email });
      sendSuccess(res, { user }, 'Teacher account created.', 201);
    } catch (e) { next(e); }
  }

  async createStudent(req, res, next) {
    try {
      const user = await userService.createStudent(req.body);
      audit(req, 'CREATE_USER', 'User', user._id, { role: 'student', email: user.email });
      sendSuccess(res, { user }, 'Student account created.', 201);
    } catch (e) { next(e); }
  }

  async createParent(req, res, next) {
    try {
      const user = await userService.createParent(req.body);
      audit(req, 'CREATE_USER', 'User', user._id, { role: 'parent', email: user.email });
      sendSuccess(res, { user }, 'Parent account created.', 201);
    } catch (e) { next(e); }
  }

  async bulkCreateStudents(req, res, next) {
    try {
      const { students } = req.body;
      if (!Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ success: false, message: 'students[] array is required.' });
      }
      if (students.length > 200) {
        return res.status(400).json({ success: false, message: 'Maximum 200 students per import.' });
      }
      const results  = await userService.bulkCreateStudents(students);
      const succeeded = results.filter(r => r.ok).length;
      const failed    = results.filter(r => !r.ok).length;
      audit(req, 'BULK_IMPORT_STUDENTS', 'User', null, { attempted: students.length, succeeded, failed });
      sendSuccess(res, { results, succeeded, failed }, `Import complete: ${succeeded} created, ${failed} failed.`, 207);
    } catch (e) { next(e); }
  }

  async enrollStudent(req, res, next) {
    try {
      const user = await userService.enrollStudentInSection(req.params.id, req.body.sectionId);
      audit(req, 'ENROLL_STUDENT', 'User', req.params.id, { sectionId: req.body.sectionId });
      sendSuccess(res, { user }, 'Student enrolled.');
    } catch (e) { next(e); }
  }

  async linkParent(req, res, next) {
    try {
      const user = await userService.linkParentToStudent(req.params.id, req.body.studentId);
      audit(req, 'LINK_PARENT', 'User', req.params.id, { studentId: req.body.studentId });
      sendSuccess(res, { user }, 'Student linked to parent.');
    } catch (e) { next(e); }
  }

  async getTeacherAssignments(req, res, next) {
    try {
      const assignments = await userService.getTeacherAssignments(req.params.id);
      sendSuccess(res, { assignments });
    } catch (e) { next(e); }
  }
}

export default new UserController();
