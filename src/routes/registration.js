import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { isAdmin } from '../middleware/rbac.js';
import { handleUpload } from '../middleware/upload.js';
import { audit } from '../lib/audit.js';
import User from '../models/User.js';
import Timetable, { TIMETABLE_DAYS, TIMETABLE_PERIODS } from '../models/Timetable.js';
import TeacherAssignment from '../models/TeacherAssignment.js';
import { sendSuccess, sendError } from '../utils/response.js';
import crypto from 'crypto';

const router = Router();

// Teacher timetable read — must be registered BEFORE router.use(isAdmin)
// so teachers can view their own schedule without admin privileges
router.get('/timetable/:teacherId', protect, async (req, res, next) => {
  try {
    const { role, _id } = req.user;
    if (role !== 'director' && role !== 'registrar' && String(_id) !== req.params.teacherId) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    const timetable = await Timetable.findOne({ teacherId: req.params.teacherId })
      .populate({ path: 'slots.sectionId', populate: { path: 'gradeId', select: 'name' } });
    sendSuccess(res, { timetable, days: TIMETABLE_DAYS, periods: TIMETABLE_PERIODS });
  } catch (e) { next(e); }
});

router.use(protect, isAdmin);

// ─── Helpers ──────────────────────────────────────────────────────
// Safely parse studentIds from multipart form data — handles string,
// JSON array string, native array, empty string, and stringified []
const parseStudentIds = (raw) => {
  if (!raw) return [];
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { arr = [raw]; }
  }
  if (!Array.isArray(arr)) arr = [arr];
  // Filter out empty strings and anything that isn't a valid 24-char ObjectId hex
  return arr.filter(id => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id.trim()));
};
async function generateStudentCode() {
  const { default: mongoose } = await import('mongoose');
  const Counter = mongoose.models.Counter || mongoose.model('Counter',
    new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } })
  );
  const year    = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `studentCode_${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true }
  );
  return `STU-${year}-${String(counter.seq).padStart(3, '0')}`;
}

// POST /api/registration/backfill-codes — one-time: assign codes to students missing them
router.post('/backfill-codes', async (req, res, next) => {
  try {
    const students = await User.find({ role: 'student', studentCode: { $in: [null, undefined, ''] } }).select('_id');
    let count = 0;
    for (const s of students) {
      const code = await generateStudentCode();
      await User.findByIdAndUpdate(s._id, { studentCode: code });
      count++;
    }
    sendSuccess(res, { updated: count }, `Backfilled ${count} student codes.`);
  } catch (e) { next(e); }
});

// ─── STUDENTS ─────────────────────────────────────────────────────

// GET /api/registration/students
router.get('/students', async (req, res, next) => {
  try {
    const { search = '', page = 1, limit = 30, sectionId, gradeId } = req.query;
    const filter = { role: 'student' };
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName:  { $regex: search, $options: 'i' } },
        { studentCode: { $regex: search, $options: 'i' } },
        { email:     { $regex: search, $options: 'i' } },
      ];
    }
    if (sectionId) filter.sectionId = sectionId;

    const skip  = (Number(page) - 1) * Number(limit);
    const [students, total] = await Promise.all([
      User.find(filter).select('-password').populate('sectionId', 'name gradeId')
        .sort({ lastName: 1, firstName: 1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(filter),
    ]);
    sendSuccess(res, { students, total, page: Number(page), limit: Number(limit) });
  } catch (e) { next(e); }
});

// POST /api/registration/students
router.post('/students', handleUpload, async (req, res, next) => {
  try {
    const {
      firstName, lastName, email, dateOfBirth, address,
      phone, familyPhone, sectionId, password,
    } = req.body;

    if (!firstName || !lastName || !email) return sendError(res, 'First name, last name and email are required.', 400);

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return sendError(res, 'An account with this email already exists.', 409);

    const studentCode    = await generateStudentCode();
    const profilePicture = req.file ? req.file.filename : null;

    const student = await User.create({
      firstName, lastName, email,
      password: password || crypto.randomBytes(8).toString('hex'),
      role: 'student',
      dateOfBirth: dateOfBirth || null,
      address:     address     || null,
      phone:       phone       || null,
      familyPhone: familyPhone || null,
      sectionId:   sectionId   || null,
      profilePicture,
      studentCode,
    });

    audit(req, 'REGISTER_STUDENT', 'User', student._id, { email: student.email, studentCode });
    sendSuccess(res, { student: student.toSafeObject() }, 'Student registered.', 201);
  } catch (e) { next(e); }
});

// PUT /api/registration/students/:id
router.put('/students/:id', handleUpload, async (req, res, next) => {
  try {
    const { password, role, studentCode, ...updates } = req.body;
    if (req.file) updates.profilePicture = req.file.filename;
    const student = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).select('-password');
    if (!student) return sendError(res, 'Student not found.', 404);
    audit(req, 'UPDATE_STUDENT', 'User', req.params.id);
    sendSuccess(res, { student }, 'Student updated.');
  } catch (e) { next(e); }
});

// ─── TEACHERS ─────────────────────────────────────────────────────

// GET /api/registration/teachers
router.get('/teachers', async (req, res, next) => {
  try {
    const { search = '', page = 1, limit = 30 } = req.query;
    const filter = { role: 'teacher' };
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName:  { $regex: search, $options: 'i' } },
        { email:     { $regex: search, $options: 'i' } },
      ];
    }
    const skip  = (Number(page) - 1) * Number(limit);
    const [teachers, total] = await Promise.all([
      User.find(filter).select('-password').sort({ lastName: 1, firstName: 1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(filter),
    ]);

    // Attach assignments for each teacher
    const teacherIds = teachers.map(t => t._id);
    const assignments = await TeacherAssignment.find({ teacherId: { $in: teacherIds }, isActive: true })
      .populate({ path: 'sectionId', populate: { path: 'gradeId', select: 'name level' } })
      .lean();

    const assignMap = assignments.reduce((m, a) => {
      const tid = String(a.teacherId);
      if (!m[tid]) m[tid] = [];
      m[tid].push(a);
      return m;
    }, {});

    const result = teachers.map(t => ({ ...t.toObject(), assignments: assignMap[String(t._id)] || [] }));
    sendSuccess(res, { teachers: result, total });
  } catch (e) { next(e); }
});

// POST /api/registration/teachers
router.post('/teachers', handleUpload, async (req, res, next) => {
  try {
    const { firstName, lastName, email, dateOfBirth, address, phone, password, assignments: rawAssignments } = req.body;
    if (!firstName || !lastName || !email) return sendError(res, 'First name, last name and email are required.', 400);

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return sendError(res, 'An account with this email already exists.', 409);

    const profilePicture = req.file ? req.file.filename : null;
    const teacher = await User.create({
      firstName, lastName, email,
      password: password || crypto.randomBytes(8).toString('hex'),
      role: 'teacher', dateOfBirth: dateOfBirth || null,
      address: address || null, phone: phone || null, profilePicture,
    });

    // Create assignments if provided
    if (rawAssignments) {
      const parsed = typeof rawAssignments === 'string' ? JSON.parse(rawAssignments) : rawAssignments;
      for (const a of parsed) {
        await TeacherAssignment.create({ teacherId: teacher._id, sectionId: a.sectionId, subject: a.subject }).catch(() => {});
      }
    }

    audit(req, 'REGISTER_TEACHER', 'User', teacher._id, { email: teacher.email });
    sendSuccess(res, { teacher: teacher.toSafeObject() }, 'Teacher registered.', 201);
  } catch (e) { next(e); }
});

// PUT /api/registration/teachers/:id
router.put('/teachers/:id', handleUpload, async (req, res, next) => {
  try {
    const { password, role, assignments: rawAssignments, ...updates } = req.body;
    if (req.file) updates.profilePicture = req.file.filename;

    const teacher = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).select('-password');
    if (!teacher) return sendError(res, 'Teacher not found.', 404);

    // Replace assignments if provided
    if (rawAssignments) {
      const parsed = typeof rawAssignments === 'string' ? JSON.parse(rawAssignments) : rawAssignments;
      await TeacherAssignment.updateMany({ teacherId: req.params.id }, { isActive: false });
      for (const a of parsed) {
        await TeacherAssignment.findOneAndUpdate(
          { teacherId: req.params.id, sectionId: a.sectionId, subject: a.subject },
          { isActive: true }, { upsert: true, setDefaultsOnInsert: true, runValidators: true }
        ).catch(() => {});
      }
    }

    audit(req, 'UPDATE_TEACHER', 'User', req.params.id);
    sendSuccess(res, { teacher }, 'Teacher updated.');
  } catch (e) { next(e); }
});

// ─── PARENTS ──────────────────────────────────────────────────────

// GET /api/registration/parents
router.get('/parents', async (req, res, next) => {
  try {
    const { search = '', page = 1, limit = 30 } = req.query;
    const filter = { role: 'parent' };
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName:  { $regex: search, $options: 'i' } },
        { email:     { $regex: search, $options: 'i' } },
      ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [parents, total] = await Promise.all([
      User.find(filter).select('-password').populate('studentIds', 'firstName lastName studentCode')
        .sort({ lastName: 1, firstName: 1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(filter),
    ]);
    sendSuccess(res, { parents, total });
  } catch (e) { next(e); }
});

// POST /api/registration/parents
router.post('/parents', handleUpload, async (req, res, next) => {
  try {
    const { firstName, lastName, email, dateOfBirth, address, phone, password, studentIds: rawIds } = req.body;
    if (!firstName || !lastName || !email) return sendError(res, 'First name, last name and email are required.', 400);

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return sendError(res, 'An account with this email already exists.', 409);

    const studentIds     = parseStudentIds(rawIds);
    const profilePicture = req.file ? req.file.filename : null;

    const parent = await User.create({
      firstName, lastName, email,
      password: password || crypto.randomBytes(8).toString('hex'),
      role: 'parent', dateOfBirth: dateOfBirth || null,
      address: address || null, phone: phone || null,
      profilePicture, studentIds,
    });

    audit(req, 'REGISTER_PARENT', 'User', parent._id, { email: parent.email });
    sendSuccess(res, { parent: parent.toSafeObject() }, 'Parent registered.', 201);
  } catch (e) { next(e); }
});

// PUT /api/registration/parents/:id
router.put('/parents/:id', handleUpload, async (req, res, next) => {
  try {
    const { password, role, studentIds: rawIds, ...updates } = req.body;
    if (req.file) updates.profilePicture = req.file.filename;
    if (rawIds !== undefined) {
      updates.studentIds = parseStudentIds(rawIds);
    }
    const parent = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).select('-password');
    if (!parent) return sendError(res, 'Parent not found.', 404);
    audit(req, 'UPDATE_PARENT', 'User', req.params.id);
    sendSuccess(res, { parent }, 'Parent updated.');
  } catch (e) { next(e); }
});

// ─── TIMETABLE ────────────────────────────────────────────────────

// PUT /api/registration/timetable/:teacherId  (upsert full timetable)
router.put('/timetable/:teacherId', async (req, res, next) => {
  try {
    const { slots, academicYear } = req.body;
    const timetable = await Timetable.findOneAndUpdate(
      { teacherId: req.params.teacherId },
      { slots: slots || [], academicYear },
      { upsert: true, new: true, runValidators: true }
    ).populate({ path: 'slots.sectionId', populate: { path: 'gradeId', select: 'name' } });

    audit(req, 'UPDATE_TIMETABLE', 'Timetable', timetable._id, { teacherId: req.params.teacherId });
    sendSuccess(res, { timetable }, 'Timetable saved.');
  } catch (e) { next(e); }
});

export default router;
