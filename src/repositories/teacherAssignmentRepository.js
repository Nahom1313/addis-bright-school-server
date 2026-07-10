import TeacherAssignment from '../models/TeacherAssignment.js';

class TeacherAssignmentRepository {
  findByTeacher(teacherId) {
    return TeacherAssignment.find({ teacherId, isActive: true })
      .populate('sectionId', 'name gradeId')
      .populate({ path: 'sectionId', populate: { path: 'gradeId', select: 'name level' } })
      .sort({ subject: 1 });
  }

  findBySection(sectionId) {
    return TeacherAssignment.find({ sectionId, isActive: true })
      .populate('teacherId', 'firstName lastName email')
      .sort({ subject: 1 });
  }

  findAll(filter = {}) {
    return TeacherAssignment.find({ isActive: true, ...filter })
      .populate('teacherId', 'firstName lastName email')
      .populate('sectionId', 'name gradeId')
      .sort({ subject: 1 });
  }

  findById(id) {
    return TeacherAssignment.findById(id)
      .populate('teacherId', 'firstName lastName email')
      .populate('sectionId', 'name gradeId');
  }

  create(data) {
    return TeacherAssignment.create(data);
  }

  updateById(id, updates) {
    return TeacherAssignment.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  }

  deleteById(id) {
    return TeacherAssignment.findByIdAndUpdate(id, { isActive: false }, { new: true });
  }

  // Remove all assignments for a teacher or section (used when deactivating)
  deactivateByTeacher(teacherId) {
    return TeacherAssignment.updateMany({ teacherId }, { isActive: false });
  }

  deactivateBySection(sectionId) {
    return TeacherAssignment.updateMany({ sectionId }, { isActive: false });
  }
}

export default new TeacherAssignmentRepository();
