import { Router } from 'express';
import CalendarEntry, { ENTRY_TYPES } from '../models/CalendarEntry.js';
import { protect }    from '../middleware/auth.js';
import { restrictTo } from '../middleware/rbac.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = Router();
router.use(protect);

// ─── GET /api/calendar — all roles, filter by academicYear ────────
router.get('/', async (req, res, next) => {
  try {
    const { year } = req.query;
    const filter = {};
    if (year) filter.academicYear = year;

    const entries = await CalendarEntry.find(filter)
      .populate('createdBy', 'firstName lastName role')
      .populate('sectionId', 'name gradeId')
      .populate({ path: 'sectionId', populate: { path: 'gradeId', select: 'name' } })
      .sort({ startDate: 1 });

    sendSuccess(res, { entries });
  } catch (e) { next(e); }
});

// ─── POST /api/calendar — director (any type) or teacher (exam only) ──
router.post('/', restrictTo('director', 'teacher'), async (req, res, next) => {
  try {
    const { title, type, startDate, endDate, description, sectionId, academicYear } = req.body;
    const { role, _id } = req.user;

    if (!title?.trim())  return sendError(res, 'Title is required.', 400);
    if (!type)           return sendError(res, 'Type is required.', 400);
    if (!startDate)      return sendError(res, 'Start date is required.', 400);
    if (!endDate)        return sendError(res, 'End date is required.', 400);
    if (!ENTRY_TYPES.includes(type)) return sendError(res, 'Invalid entry type.', 400);
    if (new Date(endDate) < new Date(startDate)) return sendError(res, 'End date must be after start date.', 400);

    // Teachers can only add exam entries
    if (role === 'teacher' && type !== 'exam') {
      return sendError(res, 'Teachers can only add exam entries.', 403);
    }

    const entry = await CalendarEntry.create({
      title: title.trim(),
      type,
      startDate: new Date(startDate),
      endDate:   new Date(endDate),
      description: description?.trim() || null,
      sectionId:   (role === 'teacher' && sectionId) ? sectionId : null,
      createdBy:     _id,
      createdByRole: role,
      academicYear:  academicYear || undefined,
    });

    const populated = await CalendarEntry.findById(entry._id)
      .populate('createdBy', 'firstName lastName role')
      .populate('sectionId', 'name gradeId');

    sendSuccess(res, { entry: populated }, 'Calendar entry added.', 201);
  } catch (e) { next(e); }
});

// ─── PATCH /api/calendar/:id — director edits any, teacher edits own exam ──
router.patch('/:id', restrictTo('director', 'teacher'), async (req, res, next) => {
  try {
    const entry = await CalendarEntry.findById(req.params.id);
    if (!entry) return sendError(res, 'Entry not found.', 404);

    const { role, _id } = req.user;

    // Teachers can only edit their own exam entries
    if (role === 'teacher') {
      if (String(entry.createdBy) !== String(_id)) return sendError(res, 'You can only edit your own entries.', 403);
      if (entry.type !== 'exam') return sendError(res, 'Teachers can only edit exam entries.', 403);
    }

    const { title, startDate, endDate, description } = req.body;
    if (title)       entry.title       = title.trim();
    if (startDate)   entry.startDate   = new Date(startDate);
    if (endDate)     entry.endDate     = new Date(endDate);
    if (description !== undefined) entry.description = description?.trim() || null;

    if (entry.endDate < entry.startDate) return sendError(res, 'End date must be after start date.', 400);

    await entry.save();
    const populated = await CalendarEntry.findById(entry._id)
      .populate('createdBy', 'firstName lastName role')
      .populate('sectionId', 'name gradeId');

    sendSuccess(res, { entry: populated }, 'Entry updated.');
  } catch (e) { next(e); }
});

// ─── DELETE /api/calendar/:id ─────────────────────────────────────
router.delete('/:id', restrictTo('director', 'teacher'), async (req, res, next) => {
  try {
    const entry = await CalendarEntry.findById(req.params.id);
    if (!entry) return sendError(res, 'Entry not found.', 404);

    const { role, _id } = req.user;
    if (role === 'teacher' && String(entry.createdBy) !== String(_id)) {
      return sendError(res, 'You can only delete your own entries.', 403);
    }
    if (role === 'teacher' && entry.type !== 'exam') {
      return sendError(res, 'Teachers can only delete exam entries.', 403);
    }

    await entry.deleteOne();
    sendSuccess(res, {}, 'Entry deleted.');
  } catch (e) { next(e); }
});

export default router;
