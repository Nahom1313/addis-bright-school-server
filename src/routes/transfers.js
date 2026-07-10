import { Router } from 'express';
import Transfer from '../models/Transfer.js';
import User     from '../models/User.js';
import Section  from '../models/Section.js';
import { protect }   from '../middleware/auth.js';
import { restrictTo } from '../middleware/rbac.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { notify } from '../lib/notify.js';

const router = Router();
router.use(protect);

// POST /api/transfers — move a student to a new section
router.post('/', restrictTo('registrar', 'director'), async (req, res, next) => {
  try {
    const { studentId, toSectionId, reason } = req.body;

    if (!studentId)   return sendError(res, 'studentId is required.', 400);
    if (!toSectionId) return sendError(res, 'toSectionId is required.', 400);

    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') return sendError(res, 'Student not found.', 404);

    const toSection = await Section.findById(toSectionId).populate('gradeId', 'name');
    if (!toSection) return sendError(res, 'Target section not found.', 404);

    if (String(student.sectionId) === String(toSectionId)) {
      return sendError(res, 'Student is already in this section.', 409);
    }

    const fromSectionId = student.sectionId || null;

    // Record the transfer
    const transfer = await Transfer.create({
      studentId,
      fromSectionId,
      toSectionId,
      reason: reason?.trim() || null,
      transferredBy: req.user._id,
    });

    // Update student's section
    student.sectionId = toSectionId;
    await student.save();

    // Populate for response
    const populated = await Transfer.findById(transfer._id)
      .populate('studentId',     'firstName lastName studentCode')
      .populate('fromSectionId', 'name gradeId')
      .populate('toSectionId',   'name gradeId')
      .populate({ path: 'fromSectionId', populate: { path: 'gradeId', select: 'name' } })
      .populate({ path: 'toSectionId',   populate: { path: 'gradeId', select: 'name' } })
      .populate('transferredBy', 'firstName lastName');

    // Notify class leaders of both sections
    const notifyLeaders = async (sectionId, message) => {
      if (!sectionId) return;
      const section = await Section.findById(sectionId);
      if (section?.classLeaderId) {
        await notify(section.classLeaderId, {
          type:  'transfer',
          title: 'Section update',
          body:  message,
          link:  '/teacher/class-leader',
        });
      }
    };

    const sName = `${student.firstName} ${student.lastName}`;
    const toName = `${toSection.gradeId?.name} — Section ${toSection.name}`;

    if (fromSectionId) {
      const fromSection = await Section.findById(fromSectionId).populate('gradeId', 'name');
      const fromName = `${fromSection?.gradeId?.name} — Section ${fromSection?.name}`;
      await notifyLeaders(fromSectionId, `${sName} has been transferred out of your section to ${toName}.`);
      await notifyLeaders(toSectionId,   `${sName} has been transferred into your section from ${fromName}.`);
    } else {
      await notifyLeaders(toSectionId, `${sName} has been enrolled in your section.`);
    }

    // Notify the student
    await notify(studentId, {
      type:  'transfer',
      title: 'Section assignment updated',
      body:  `You have been transferred to ${toName}.`,
      link:  null,
    });

    sendSuccess(res, { transfer: populated }, 'Student transferred successfully.', 201);
  } catch (e) { next(e); }
});

// GET /api/transfers/:studentId — transfer history for a student
router.get('/:studentId', restrictTo('registrar', 'director', 'teacher'), async (req, res, next) => {
  try {
    const transfers = await Transfer.find({ studentId: req.params.studentId })
      .populate('fromSectionId', 'name gradeId')
      .populate('toSectionId',   'name gradeId')
      .populate({ path: 'fromSectionId', populate: { path: 'gradeId', select: 'name' } })
      .populate({ path: 'toSectionId',   populate: { path: 'gradeId', select: 'name' } })
      .populate('transferredBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    sendSuccess(res, { transfers });
  } catch (e) { next(e); }
});

export default router;
