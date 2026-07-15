import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import TeacherAssignment from '../models/TeacherAssignment.js';
import { sendSuccess, sendError } from '../utils/response.js';

const VALID_STATUSES = ['present', 'absent', 'late', 'excused'];

// Confirms a teacher is actually assigned to this section before letting
// them read/write its attendance. Directors bypass this (they manage all
// sections). Without this check, any teacher token could submit or view
// attendance for any section in the school.
const assertSectionAccess = async (req, sectionId) => {
  if (req.user.role === 'director') return true;
  const assignment = await TeacherAssignment.findOne({
    teacherId: req.user._id,
    sectionId,
    isActive: true,
  }).lean();
  return !!assignment;
};

// POST /api/attendance — teacher submits attendance for a section on a date
export const submitAttendance = async (req, res, next) => {
  try {
    const { sectionId, date, entries } = req.body;
    if (!sectionId || !date || !Array.isArray(entries) || entries.length === 0) {
      return sendError(res, 'sectionId, date, and entries[] are required.', 400);
    }

    const hasAccess = await assertSectionAccess(req, sectionId);
    if (!hasAccess) {
      return sendError(res, 'You are not assigned to this section.', 403);
    }

    // Reject bad status values up front (belt-and-suspenders alongside the
    // schema enum, since bulkWrite does not run schema validators by
    // default and could otherwise write arbitrary strings straight to Mongo).
    for (const entry of entries) {
      if (entry.status && !VALID_STATUSES.includes(entry.status)) {
        return sendError(res, `Invalid status "${entry.status}" for student ${entry.studentId}.`, 400);
      }
    }

    const attendanceDate = new Date(date);
    if (isNaN(attendanceDate.getTime())) {
      return sendError(res, 'Invalid date.', 400);
    }
    attendanceDate.setUTCHours(0, 0, 0, 0); // normalise to midnight UTC

    // Reject attendance dates in the future — there is nothing to attend yet.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (attendanceDate.getTime() > today.getTime()) {
      return sendError(res, 'Attendance date cannot be in the future.', 400);
    }

    const ops = entries.map(({ studentId, status, note }) => ({
      updateOne: {
        filter: { studentId, sectionId, date: attendanceDate },
        update: {
          $set: {
            studentId,
            sectionId,
            teacherId: req.user._id,
            date: attendanceDate,
            status: status || 'present',
            note: note || null,
          },
        },
        upsert: true,
      },
    }));

    await Attendance.bulkWrite(ops, { runValidators: true });
    sendSuccess(res, { saved: entries.length }, 'Attendance saved.');
  } catch (err) { next(err); }
};

// GET /api/attendance?sectionId=&date= — get attendance for a section on a date
export const getBySection = async (req, res, next) => {
  try {
    const { sectionId, date } = req.query;
    if (!sectionId) return sendError(res, 'sectionId is required.', 400);

    const hasAccess = await assertSectionAccess(req, sectionId);
    if (!hasAccess) {
      return sendError(res, 'You are not assigned to this section.', 403);
    }

    const query = { sectionId };
    if (date) {
      const d = new Date(date);
      d.setUTCHours(0, 0, 0, 0);
      const dayAfter = new Date(d);
      dayAfter.setDate(dayAfter.getDate() + 1);
      query.date = { $gte: d, $lt: dayAfter };
    }

    const records = await Attendance.find(query)
      .populate('studentId', 'firstName lastName studentCode')
      .sort({ date: -1 })
      .lean();

    sendSuccess(res, { records });
  } catch (err) { next(err); }
};

// GET /api/attendance/student/:studentId — attendance history for a student
export const getByStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
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

    const records = await Attendance.find({ studentId })
      .sort({ date: -1 })
      .limit(90) // last 3 months
      .lean();

    // Summary stats
    const total   = records.length;
    const present = records.filter(r => r.status === 'present').length;
    const absent  = records.filter(r => r.status === 'absent').length;
    const late    = records.filter(r => r.status === 'late').length;
    const excused = records.filter(r => r.status === 'excused').length;

    sendSuccess(res, { records, stats: { total, present, absent, late, excused } });
  } catch (err) { next(err); }
};
