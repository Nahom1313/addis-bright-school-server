import Meeting from '../models/Meeting.js';
import { sendSuccess } from '../utils/response.js';
import { createError } from '../middleware/errorHandler.js';
import { randomBytes } from 'crypto';

const populate = (q) =>
  q
    .populate('createdBy', 'firstName lastName role')
    .populate('sectionId', 'name')
    .populate('gradeId', 'name level');

class MeetingController {
  // GET /api/meetings — all authenticated users
  async getAll(req, res, next) {
    try {
      const filter = { isActive: true };
      if (req.query.sectionId) filter.sectionId = req.query.sectionId;
      const meetings = await populate(
        Meeting.find(filter).sort({ scheduledAt: 1 })
      );
      sendSuccess(res, { meetings });
    } catch (e) { next(e); }
  }

  // GET /api/meetings/upcoming
  async getUpcoming(req, res, next) {
    try {
      const now = new Date();
      const filter = {
        isActive: true,
        scheduledAt: { $gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) }, // include meetings started up to 2h ago
        $or: [{ scope: 'school' }],
      };
      if (req.query.sectionId) filter.$or.push({ scope: 'section', sectionId: req.query.sectionId });
      const meetings = await populate(
        Meeting.find(filter).sort({ scheduledAt: 1 }).limit(30)
      );
      sendSuccess(res, { meetings });
    } catch (e) { next(e); }
  }

  // GET /api/meetings/:id
  async getById(req, res, next) {
    try {
      const meeting = await populate(Meeting.findById(req.params.id));
      if (!meeting || !meeting.isActive) throw createError('Meeting not found.', 404);
      sendSuccess(res, { meeting });
    } catch (e) { next(e); }
  }

  // POST /api/meetings — director or teacher
  async create(req, res, next) {
    try {
      const { title, description, scheduledAt, durationMinutes, scope, sectionId, gradeId } = req.body;

      if (new Date(scheduledAt) < new Date()) {
        throw createError('Scheduled time must be in the future.', 400);
      }

      // Generate a collision-resistant room name: schoolcode-slug-randomid
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
      const roomName = `addisbright-${slug}-${randomBytes(5).toString('hex')}`;

      const meeting = await Meeting.create({
        title,
        description: description || null,
        scheduledAt,
        durationMinutes: durationMinutes || 60,
        scope: scope || 'school',
        sectionId: sectionId || null,
        gradeId: gradeId || null,
        roomName,
        createdBy: req.user._id,
      });

      const populated = await populate(Meeting.findById(meeting._id));
      sendSuccess(res, { meeting: populated }, 'Meeting scheduled.', 201);
    } catch (e) { next(e); }
  }

  // PATCH /api/meetings/:id
  async update(req, res, next) {
    try {
      const meeting = await Meeting.findById(req.params.id);
      if (!meeting || !meeting.isActive) throw createError('Meeting not found.', 404);
      const { title, description, scheduledAt, durationMinutes, scope, sectionId, gradeId } = req.body;
      Object.assign(meeting, {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(scheduledAt && { scheduledAt }),
        ...(durationMinutes && { durationMinutes }),
        ...(scope && { scope }),
        ...(sectionId !== undefined && { sectionId }),
        ...(gradeId !== undefined && { gradeId }),
      });
      await meeting.save();
      const populated = await populate(Meeting.findById(meeting._id));
      sendSuccess(res, { meeting: populated }, 'Meeting updated.');
    } catch (e) { next(e); }
  }

  // DELETE /api/meetings/:id
  async delete(req, res, next) {
    try {
      const meeting = await Meeting.findById(req.params.id);
      if (!meeting || !meeting.isActive) throw createError('Meeting not found.', 404);
      meeting.isActive = false;
      await meeting.save();
      sendSuccess(res, {}, 'Meeting cancelled.');
    } catch (e) { next(e); }
  }
}

export default new MeetingController();
