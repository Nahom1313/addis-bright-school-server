import statusLogService from '../services/statusLogService.js';
import { sendSuccess }  from '../utils/response.js';

class StatusLogController {
  /**
   * POST /api/logs
   * Teacher creates a new status log for a student.
   */
  async create(req, res, next) {
    try {
      const log = await statusLogService.create({
        teacherId: req.user._id,
        ...req.body,
      });
      // Respond immediately — AI enrichment runs in background
      sendSuccess(res, { log }, 'Status log created. AI enrichment in progress.', 201);
    } catch (e) { next(e); }
  }

  /**
   * GET /api/logs/feed
   * Parent fetches their children's full activity feed.
   */
  async getFeed(req, res, next) {
    try {
      const logs = await statusLogService.getFeedForParent(req.user._id);
      sendSuccess(res, { logs });
    } catch (e) { next(e); }
  }

  /**
   * GET /api/logs/student/:studentId
   * Teacher or Director views logs for a specific student.
   */
  async getByStudent(req, res, next) {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const skip  = Number(req.query.skip) || 0;
      const logs  = await statusLogService.getByStudent(req.params.studentId, { limit, skip });
      sendSuccess(res, { logs });
    } catch (e) { next(e); }
  }

  /**
   * GET /api/logs/my
   * Teacher views all logs they've written.
   */
  async getMine(req, res, next) {
    try {
      const logs = await statusLogService.getByTeacher(req.user._id);
      sendSuccess(res, { logs });
    } catch (e) { next(e); }
  }

  /**
   * GET /api/logs/section/:sectionId
   * Teacher or Director views all logs for a section.
   */
  async getBySection(req, res, next) {
    try {
      const logs = await statusLogService.getBySection(req.params.sectionId);
      sendSuccess(res, { logs });
    } catch (e) { next(e); }
  }

  /**
   * DELETE /api/logs/:id
   */
  async deleteLog(req, res, next) {
    try {
      await statusLogService.deleteLog(req.params.id, req.user._id, req.user.role);
      sendSuccess(res, {}, 'Log deleted.');
    } catch (e) { next(e); }
  }
}

export default new StatusLogController();
