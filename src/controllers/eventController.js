import eventService from '../services/eventService.js';
import { sendSuccess } from '../utils/response.js';

class EventController {
  // GET /api/events?sectionId=xxx  — all authenticated users
  async getUpcoming(req, res, next) {
    try {
      const events = await eventService.getUpcoming(req.query.sectionId || null);
      sendSuccess(res, { events });
    } catch (e) { next(e); }
  }

  async getAll(req, res, next) {
    try {
      const events = await eventService.getAll();
      sendSuccess(res, { events });
    } catch (e) { next(e); }
  }

  async getById(req, res, next) {
    try {
      const event = await eventService.getById(req.params.id);
      sendSuccess(res, { event });
    } catch (e) { next(e); }
  }

  // POST — director or teacher
  async create(req, res, next) {
    try {
      const event = await eventService.create(req.body, req.user._id);
      sendSuccess(res, { event }, 'Event created.', 201);
    } catch (e) { next(e); }
  }

  async update(req, res, next) {
    try {
      const event = await eventService.update(req.params.id, req.body);
      sendSuccess(res, { event }, 'Event updated.');
    } catch (e) { next(e); }
  }

  async delete(req, res, next) {
    try {
      await eventService.delete(req.params.id);
      sendSuccess(res, {}, 'Event deleted.');
    } catch (e) { next(e); }
  }
}

export default new EventController();
