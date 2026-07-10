import statusLogRepository from '../repositories/statusLogRepository.js';
import userRepository       from '../repositories/userRepository.js';
import teacherAssignmentRepository from '../repositories/teacherAssignmentRepository.js';
import enrichStatusLog      from '../lib/aiEnrichment.js';
import { emitToUser }       from '../lib/socketEmitter.js';
import { createError }      from '../middleware/errorHandler.js';
import { sendPush }         from '../lib/pushNotification.js';
import AuditLog             from '../models/AuditLog.js';

class StatusLogService {
  async create({ teacherId, studentId, sectionId, rawNote }) {
    const student = await userRepository.findById(studentId);
    if (!student || student.role !== 'student') {
      throw createError('Student not found.', 404);
    }

    const assignments = await teacherAssignmentRepository.findByTeacher(teacherId);
    const assignedSectionIds = assignments.map(a => String(a.sectionId?._id || a.sectionId));
    if (!assignedSectionIds.includes(String(sectionId))) {
      throw createError('You are not assigned to this section.', 403);
    }

    const log = await statusLogRepository.create({
      teacherId,
      studentId,
      sectionId,
      rawNote,
      enriched: false,
    });

    const populated = await statusLogRepository.findById(log._id);

    this._notifyParents(studentId, 'new_status_log', populated);
    this._enrichAsync(log._id, rawNote, student, populated.teacherId);

    return populated;
  }

  async _enrichAsync(logId, rawNote, student, teacher) {
    try {
      const studentName = `${student.firstName} ${student.lastName}`;
      const teacherName = teacher
        ? `${teacher.firstName} ${teacher.lastName}`
        : 'Teacher';

      const enriched = await enrichStatusLog(rawNote, studentName, teacherName);
      const updatedLog = await statusLogRepository.updateEnrichment(logId, enriched);

      this._notifyParents(student._id, 'log_enriched', updatedLog);
      console.log(`✨ Log ${logId} enriched — tone: ${enriched.tone}`);
    } catch (err) {
      console.error(`❌ AI enrichment failed for log ${logId}:`, err.message);
      await statusLogRepository.markEnrichmentFailed(logId, err.message);

      const fallbackLog = await statusLogRepository.findById(logId);
      if (fallbackLog) {
        this._notifyParents(student._id, 'log_enriched', fallbackLog);
      }
    }
  }

  async _notifyParents(studentId, event, payload) {
    try {
      const User = (await import('../models/User.js')).default;
      const parents = await userRepository.findParentsOfStudent(studentId);

      // Get FCM tokens for push notifications
      const parentIds = parents.map(p => p._id);
      const parentsFull = await User.find({ _id: { $in: parentIds } }).select('+fcmTokens').lean();
      const allTokens = parentsFull.flatMap(p => p.fcmTokens || []);

      parents.forEach(parent => {
        emitToUser(parent._id, event, { log: payload });
      });

      // Push notification when app is closed
      if (allTokens.length && payload?.summary) {
        const studentName = payload.studentId?.firstName || 'your child';
        await sendPush(allTokens, {
          title: `Update about ${studentName}`,
          body:  payload.summary.slice(0, 100),
          data:  { type: 'status_log', logId: String(payload._id || '') },
        });
      }
    } catch (err) {
      console.error('Notify error:', err.message);
    }
  }

  // FIX: Add pagination support to list queries
  async getByStudent(studentId, { limit = 50, skip = 0 } = {}) {
    const student = await userRepository.findById(studentId);
    if (!student) throw createError('Student not found.', 404);
    return statusLogRepository.findByStudent(studentId, limit, skip);
  }

  async getByTeacher(teacherId, { limit = 100, skip = 0 } = {}) {
    return statusLogRepository.findByTeacher(teacherId, limit, skip);
  }

  async getBySection(sectionId, { limit = 100, skip = 0 } = {}) {
    return statusLogRepository.findBySection(sectionId, limit, skip);
  }

  async getById(id) {
    const log = await statusLogRepository.findById(id);
    if (!log) throw createError('Log not found.', 404);
    return log;
  }

  async getFeedForParent(parentId, { limit = 30 } = {}) {
    const parent = await userRepository.findById(parentId);
    if (!parent || parent.role !== 'parent') {
      throw createError('Parent not found.', 404);
    }
    if (!parent.studentIds?.length) return [];

    // studentIds may be populated objects or raw ObjectIds — normalise both
    const studentIds = parent.studentIds.map(s => s._id || s);

    const allLogs = await Promise.all(
      studentIds.map(sid => statusLogRepository.findByStudent(sid, limit))
    );
    return allLogs
      .flat()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async deleteLog(id, requesterId, requesterRole) {
    const log = await statusLogRepository.findById(id);
    if (!log) throw createError('Log not found.', 404);

    const isAuthor = String(log.teacherId?._id || log.teacherId) === String(requesterId);
    if (!isAuthor && requesterRole !== 'director') {
      throw createError('You do not have permission to delete this log.', 403);
    }

    return statusLogRepository.deleteById(id);
  }
}

export default new StatusLogService();
