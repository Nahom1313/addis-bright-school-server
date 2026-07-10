import Section from '../models/Section.js';

class SectionRepository {
  findAll(filter = {}) {
    return Section.find({ isActive: true, ...filter })
      .populate('gradeId', 'name level')
      .populate('studentCount')
      .populate('classLeaderId', 'firstName lastName')
      .sort({ name: 1 });
  }

  findById(id) {
    return Section.findById(id)
      .populate('gradeId', 'name level')
      .populate('studentCount');
  }

  findByGrade(gradeId) {
    return Section.find({ gradeId, isActive: true })
      .populate('studentCount')
      .sort({ name: 1 });
  }

  create(data) {
    return Section.create(data);
  }

  updateById(id, updates) {
    return Section.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
      .populate('gradeId', 'name level');
  }

  deleteById(id) {
    return Section.findByIdAndUpdate(id, { isActive: false }, { new: true });
  }

  exists(gradeId, name, excludeId = null) {
    const filter = { gradeId, name: new RegExp(`^${name}$`, 'i') };
    if (excludeId) filter._id = { $ne: excludeId };
    return Section.exists(filter);
  }
}

export default new SectionRepository();
