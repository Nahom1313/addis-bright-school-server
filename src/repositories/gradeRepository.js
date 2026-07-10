import Grade from '../models/Grade.js';

class GradeRepository {
  findAll(activeOnly = true) {
    const filter = activeOnly ? { isActive: true } : {};
    return Grade.find(filter).sort({ level: 1 }).populate('sections');
  }

  findById(id) {
    return Grade.findById(id).populate('sections');
  }

  findByIdLean(id) {
    return Grade.findById(id).lean();
  }

  create(data) {
    return Grade.create(data);
  }

  updateById(id, updates) {
    return Grade.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  }

  deleteById(id) {
    // Soft delete
    return Grade.findByIdAndUpdate(id, { isActive: false }, { new: true });
  }

  nameExists(name, excludeId = null) {
    const filter = { name: new RegExp(`^${name}$`, 'i') };
    if (excludeId) filter._id = { $ne: excludeId };
    return Grade.exists(filter);
  }
}

export default new GradeRepository();
