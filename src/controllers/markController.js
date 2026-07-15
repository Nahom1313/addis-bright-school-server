import Mark from '../models/Mark.js';
import User from '../models/User.js';
import TeacherAssignment from '../models/TeacherAssignment.js';
import { sendSuccess, sendError } from '../utils/response.js';

// Confirms a teacher is actually assigned to teach this section+subject
// before letting them read/write its marks. Directors bypass this (they
// manage all sections/subjects). Without this check, any teacher token
// could overwrite or read another teacher's class marks.
const assertSubjectAccess = async (req, sectionId, subject) => {
  if (req.user.role === 'director') return true;
  const assignment = await TeacherAssignment.findOne({
    teacherId: req.user._id,
    sectionId,
    subject,
    isActive: true,
  }).lean();
  return !!assignment;
};

// POST /api/marks/entry — teacher saves marks for a section+subject (bulk upsert)
export const saveGrades = async (req, res, next) => {
  try {
    const { sectionId, entries } = req.body;
    if (!sectionId || !Array.isArray(entries) || entries.length === 0) {
      return sendError(res, 'sectionId and entries[] are required.', 400);
    }

    // Every entry must belong to a subject the teacher is actually assigned
    // to teach in this section (directors are exempt).
    const subjects = [...new Set(entries.map(e => e.subject).filter(Boolean))];
    for (const subject of subjects) {
      const hasAccess = await assertSubjectAccess(req, sectionId, subject);
      if (!hasAccess) {
        return sendError(res, `You are not assigned to teach ${subject} for this section.`, 403);
      }
    }

    // FIX: Validate score <= maxScore before persisting.
    // Use a null/undefined check rather than `||`, since `||` treats a
    // legitimate maxScore of 0 as falsy and silently rewrites it to 100.
    for (const entry of entries) {
      const max = (entry.maxScore === undefined || entry.maxScore === null) ? 100 : entry.maxScore;
      if (typeof max !== 'number' || max <= 0) {
        return sendError(res, `Invalid maxScore for student ${entry.studentId}: must be a positive number.`, 400);
      }
      if (typeof entry.score !== 'number' || entry.score < 0) {
        return sendError(res, `Invalid score for student ${entry.studentId}: must be a non-negative number.`, 400);
      }
      if (entry.score > max) {
        return sendError(res, `Score ${entry.score} exceeds maxScore ${max} for student ${entry.studentId}.`, 400);
      }
    }

    const ops = entries.map(({ studentId, score, maxScore, subject, term }) => ({
      updateOne: {
        filter: { studentId, sectionId, subject, teacherId: req.user._id },
        update: {
          $set: {
            score,
            maxScore: (maxScore === undefined || maxScore === null) ? 100 : maxScore,
            teacherId: req.user._id,
            term: term || 'Term 1',
          },
        },
        upsert: true,
      },
    }));

    await Mark.bulkWrite(ops, { runValidators: true });
    sendSuccess(res, { saved: entries.length }, 'Grades saved.');
  } catch (err) { next(err); }
};

// GET /api/marks/entry?sectionId=&subject= — fetch saved marks for a section+subject
export const getGrades = async (req, res, next) => {
  try {
    const { sectionId, subject } = req.query;
    if (!sectionId || !subject) return sendError(res, 'sectionId and subject required.', 400);

    const hasAccess = await assertSubjectAccess(req, sectionId, subject);
    if (!hasAccess) {
      return sendError(res, 'You are not assigned to teach this subject for this section.', 403);
    }

    const marks = await Mark.find({ sectionId, subject }).lean();
    const scoreMap = marks.reduce((acc, m) => { acc[m.studentId] = m.score; return acc; }, {});
    sendSuccess(res, { marks, scoreMap });
  } catch (err) { next(err); }
};

// GET /api/marks/student/:id — student views their own marks, parent views child marks
export const getStudentMarks = async (req, res, next) => {
  try {
    const studentId = req.params.id;
    const { role, _id: requesterId } = req.user;

    // Students can only view their own marks
    if (role === 'student' && String(requesterId) !== studentId) {
      return sendError(res, 'Forbidden', 403);
    }

    // FIX: Parents can view marks for their linked children
    if (role === 'parent') {
      const parent = await User.findById(requesterId).select('studentIds');
      const linkedIds = (parent?.studentIds || []).map(String);
      if (!linkedIds.includes(studentId)) {
        return sendError(res, 'You are not linked to this student.', 403);
      }
    }

    // Directors and teachers can view any student
    const marks = await Mark.find({ studentId }).sort({ subject: 1, term: 1 }).lean();
    sendSuccess(res, { marks });
  } catch (err) { next(err); }
};

// GET /api/marks/student/:id/summary — aggregate averages per subject
export const getStudentMarksSummary = async (req, res, next) => {
  try {
    const studentId = req.params.id;
    const { role, _id: requesterId } = req.user;

    if (role === 'student' && String(requesterId) !== studentId) {
      return sendError(res, 'Forbidden', 403);
    }

    if (role === 'parent') {
      const parent = await User.findById(requesterId).select('studentIds');
      const linkedIds = (parent?.studentIds || []).map(String);
      if (!linkedIds.includes(studentId)) {
        return sendError(res, 'You are not linked to this student.', 403);
      }
    }

    const summary = await Mark.aggregate([
      { $match: { studentId: new (await import('mongoose')).default.Types.ObjectId(studentId) } },
      {
        $group: {
          _id: { subject: '$subject', term: '$term' },
          avgScore: { $avg: { $multiply: [{ $divide: ['$score', '$maxScore'] }, 100] } },
          totalScore: { $sum: '$score' },
          totalMax: { $sum: '$maxScore' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.subject': 1, '_id.term': 1 } },
    ]);

    sendSuccess(res, { summary });
  } catch (err) { next(err); }
};
