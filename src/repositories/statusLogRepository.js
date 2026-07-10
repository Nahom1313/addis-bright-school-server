import StatusLog from '../models/StatusLog.js';

class StatusLogRepository {
  /**
   * Create a new log (unenriched — AI runs async after this)
   */
  create(data) {
    return StatusLog.create(data);
  }

  /**
   * All logs for a student, newest first — used by parent feed
   */
  findByStudent(studentId, limit = 50, skip = 0) {
    return StatusLog.find({ studentId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('teacherId', 'firstName lastName')
      .populate('studentId', 'firstName lastName studentCode')
      .populate('sectionId', 'name');
  }

  /**
   * All logs written by a teacher, newest first
   */
  findByTeacher(teacherId, limit = 100) {
    return StatusLog.find({ teacherId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('studentId', 'firstName lastName studentCode')
      .populate('sectionId', 'name');
  }

  /**
   * All logs for a section — teacher/director view
   */
  findBySection(sectionId, limit = 100) {
    return StatusLog.find({ sectionId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('teacherId', 'firstName lastName')
      .populate('studentId', 'firstName lastName studentCode');
  }

  /**
   * Update enrichment fields after AI call completes
   */
  updateEnrichment(id, enrichmentData) {
    return StatusLog.findByIdAndUpdate(
      id,
      { $set: { enriched: true, enrichmentError: null, ...enrichmentData } },
      { new: true }
    )
      .populate('teacherId', 'firstName lastName')
      .populate('studentId', 'firstName lastName studentCode')
      .populate('sectionId', 'name');
  }

  /**
   * Mark enrichment as failed with an error message
   */
  markEnrichmentFailed(id, errorMessage) {
    return StatusLog.findByIdAndUpdate(
      id,
      { $set: { enriched: false, enrichmentError: errorMessage } },
      { new: true }
    );
  }

  findById(id) {
    return StatusLog.findById(id)
      .populate('teacherId', 'firstName lastName')
      .populate('studentId', 'firstName lastName studentCode')
      .populate('sectionId', 'name');
  }

  deleteById(id) {
    return StatusLog.findByIdAndDelete(id);
  }

  /**
   * Count logs per student — for analytics
   */
  countByStudent(studentId) {
    return StatusLog.countDocuments({ studentId });
  }
}

export default new StatusLogRepository();
