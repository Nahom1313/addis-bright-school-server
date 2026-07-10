import { Router } from 'express';
import { z } from 'zod';
import Homework from '../models/Homework.js';
import User from '../models/User.js';
import TeacherAssignment from '../models/TeacherAssignment.js';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/rbac.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { emitToUser } from '../lib/socketEmitter.js';
import { sendPush }   from '../lib/pushNotification.js';
import { notifyMany } from '../lib/notify.js';

const router = Router();
router.use(protect);

// ─── Validators ───────────────────────────────────────────────────
const createSchema = z.object({
  sectionId:   z.string().length(24, 'Invalid section ID'),
  subject:     z.string().min(1).max(100),
  title:       z.string().min(1).max(150),
  description: z.string().max(2000).optional().nullable(),
  dueDate:     z.coerce.date().refine(d => d > new Date(), { message: 'Due date must be in the future' }),
  resourceUrl: z.string().url('Must be a valid URL').optional().nullable(),
});

const updateSchema = createSchema.partial().omit({ sectionId: true });

// ─── Helpers ──────────────────────────────────────────────────────
const populateHomework = (q) =>
  q
    .populate('teacherId', 'firstName lastName')
    .populate('sectionId', 'name gradeId')
    .populate({ path: 'sectionId', populate: { path: 'gradeId', select: 'name level' } });

// Notify students in a section + their parents
async function notifySection(sectionId, event, payload) {
  try {
    const students = await User.find({ role: 'student', sectionId, isActive: true }).select('_id');
    const studentIds = students.map(s => s._id);

    // Emit socket to each student
    studentIds.forEach(sid => emitToUser(sid, event, payload));

    // Find parents of those students
    const parents = await User.find({ role: 'parent', studentIds: { $in: studentIds }, isActive: true })
      .select('+fcmTokens _id');

    // Emit socket to each parent
    parents.forEach(p => emitToUser(p._id, event, payload));

    // Persist inbox notifications
    if (payload.homework) {
      const hw = payload.homework;
      const notifPayload = {
        type:  'homework',
        title: `New homework: ${hw.subject}`,
        body:  hw.title.slice(0, 120),
        link:  '/student/homework',
      };
      await notifyMany(studentIds, notifPayload);
      await notifyMany(parents.map(p => p._id), { ...notifPayload, link: '/parent/homework' });
    }

    // Push notification
    const allTokens = parents.flatMap(p => p.fcmTokens || []).filter(Boolean);
    if (allTokens.length && payload.homework) {
      const hw = payload.homework;
      await sendPush(allTokens, {
        title: `New homework: ${hw.subject}`,
        body:  hw.title.slice(0, 100),
        data:  { type: 'homework', homeworkId: String(hw._id) },
      });
    }
  } catch (err) {
    console.error('[homework] notify error:', err.message);
  }
}

// ─── GET /api/homework — teacher or director sees all, filtered ───
router.get('/', restrictTo('teacher', 'director'), async (req, res, next) => {
  try {
    const { sectionId, subject } = req.query;
    const filter = { isActive: true };

    if (req.user.role === 'teacher') filter.teacherId = req.user._id;
    if (sectionId) filter.sectionId = sectionId;
    if (subject)   filter.subject   = subject;

    const homework = await populateHomework(
      Homework.find(filter).sort({ dueDate: 1 })
    );
    sendSuccess(res, { homework });
  } catch (err) { next(err); }
});

// ─── GET /api/homework/section/:sectionId — students/parents view ─
router.get('/section/:sectionId', async (req, res, next) => {
  try {
    const { sectionId } = req.params;
    const { role, _id: userId } = req.user;

    // Students: must be in this section
    if (role === 'student') {
      const student = await User.findById(userId).select('sectionId');
      if (String(student?.sectionId) !== sectionId) {
        return sendError(res, 'You are not enrolled in this section.', 403);
      }
    }

    // Parents: must have a child in this section
    if (role === 'parent') {
      const parent = await User.findById(userId).select('studentIds');
      const children = await User.find({
        _id: { $in: parent?.studentIds || [] },
        sectionId,
      }).countDocuments();
      if (children === 0) {
        return sendError(res, 'None of your children are in this section.', 403);
      }
    }

    const homework = await populateHomework(
      Homework.find({ sectionId, isActive: true }).sort({ dueDate: 1 })
    );
    sendSuccess(res, { homework });
  } catch (err) { next(err); }
});

// ─── GET /api/homework/my-children — parent sees merged homework ──
router.get('/my-children', restrictTo('parent'), async (req, res, next) => {
  try {
    const parent = await User.findById(req.user._id).select('studentIds');
    if (!parent?.studentIds?.length) return sendSuccess(res, { homework: [] });

    const children = await User.find({
      _id: { $in: parent.studentIds },
      isActive: true,
    }).select('sectionId firstName lastName');

    const sectionIds = [...new Set(children.map(c => String(c.sectionId)).filter(Boolean))];
    if (!sectionIds.length) return sendSuccess(res, { homework: [] });

    const homework = await populateHomework(
      Homework.find({ sectionId: { $in: sectionIds }, isActive: true }).sort({ dueDate: 1 })
    );

    // Attach which child(ren) each homework is for
    const childMap = children.reduce((m, c) => {
      m[String(c.sectionId)] = m[String(c.sectionId)] || [];
      m[String(c.sectionId)].push({ _id: c._id, firstName: c.firstName, lastName: c.lastName });
      return m;
    }, {});

    const enriched = homework.map(hw => ({
      ...hw.toObject(),
      children: childMap[String(hw.sectionId?._id || hw.sectionId)] || [],
    }));

    sendSuccess(res, { homework: enriched });
  } catch (err) { next(err); }
});

// ─── POST /api/homework — teacher creates homework ────────────────
router.post('/', restrictTo('teacher', 'director'), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed', 422, parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
    }
    const data = parsed.data;

    // Verify teacher is assigned to this section (skip check for directors)
    if (req.user.role === 'teacher') {
      const assignment = await TeacherAssignment.findOne({
        teacherId: req.user._id,
        sectionId: data.sectionId,
        isActive: true,
      });
      if (!assignment) {
        return sendError(res, 'You are not assigned to this section.', 403);
      }
    }

    const hw = await Homework.create({ ...data, teacherId: req.user._id });
    const populated = await populateHomework(Homework.findById(hw._id));

    // Notify students and parents in background
    notifySection(data.sectionId, 'new_homework', { homework: populated });

    sendSuccess(res, { homework: populated }, 'Homework posted.', 201);
  } catch (err) { next(err); }
});

// ─── PATCH /api/homework/:id — teacher updates homework ──────────
router.patch('/:id', restrictTo('teacher', 'director'), async (req, res, next) => {
  try {
    const hw = await Homework.findById(req.params.id);
    if (!hw || !hw.isActive) return sendError(res, 'Homework not found.', 404);

    if (req.user.role === 'teacher' && String(hw.teacherId) !== String(req.user._id)) {
      return sendError(res, 'You can only edit your own homework.', 403);
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed', 422, parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
    }

    Object.assign(hw, parsed.data);
    await hw.save();
    const populated = await populateHomework(Homework.findById(hw._id));

    sendSuccess(res, { homework: populated }, 'Homework updated.');
  } catch (err) { next(err); }
});

// ─── DELETE /api/homework/:id — teacher deletes (soft) ───────────
router.delete('/:id', restrictTo('teacher', 'director'), async (req, res, next) => {
  try {
    const hw = await Homework.findById(req.params.id);
    if (!hw || !hw.isActive) return sendError(res, 'Homework not found.', 404);

    if (req.user.role === 'teacher' && String(hw.teacherId) !== String(req.user._id)) {
      return sendError(res, 'You can only delete your own homework.', 403);
    }

    hw.isActive = false;
    await hw.save();
    sendSuccess(res, {}, 'Homework deleted.');
  } catch (err) { next(err); }
});

export default router;
