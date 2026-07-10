import Event from '../models/Event.js';

class EventRepository {
  // All upcoming school-wide events (+ optional section filter)
  findUpcoming(sectionId = null) {
    const filter = {
      isActive: true,
      startDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // include today
      $or: [{ scope: 'school' }],
    };
    if (sectionId) filter.$or.push({ scope: 'section', sectionId });
    return Event.find(filter)
      .sort({ startDate: 1 })
      .limit(50)
      .populate('createdBy', 'firstName lastName role')
      .populate('sectionId', 'name')
      .populate('gradeId', 'name');
  }

  findAll(filter = {}) {
    return Event.find({ isActive: true, ...filter })
      .sort({ startDate: 1 })
      .populate('createdBy', 'firstName lastName')
      .populate('sectionId', 'name')
      .populate('gradeId', 'name level');
  }

  findById(id) {
    return Event.findById(id)
      .populate('createdBy', 'firstName lastName')
      .populate('sectionId', 'name')
      .populate('gradeId', 'name');
  }

  create(data) {
    return Event.create(data);
  }

  updateById(id, updates) {
    return Event.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  }

  deleteById(id) {
    return Event.findByIdAndUpdate(id, { isActive: false }, { new: true });
  }
}

export default new EventRepository();
