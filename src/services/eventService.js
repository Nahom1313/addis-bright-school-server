import eventRepository from '../repositories/eventRepository.js';
import { createError } from '../middleware/errorHandler.js';

class EventService {
  async getUpcoming(sectionId = null) {
    return eventRepository.findUpcoming(sectionId);
  }

  async getAll() {
    return eventRepository.findAll();
  }

  async getById(id) {
    const event = await eventRepository.findById(id);
    if (!event) throw createError('Event not found.', 404);
    return event;
  }

  async create(data, userId) {
    // Validate date logic
    if (data.endDate && new Date(data.endDate) < new Date(data.startDate)) {
      throw createError('End date must be after start date.', 400);
    }
    return eventRepository.create({ ...data, createdBy: userId });
  }

  async update(id, updates) {
    const event = await eventRepository.findById(id);
    if (!event) throw createError('Event not found.', 404);
    return eventRepository.updateById(id, updates);
  }

  async delete(id) {
    const event = await eventRepository.findById(id);
    if (!event) throw createError('Event not found.', 404);
    return eventRepository.deleteById(id);
  }
}

export default new EventService();
