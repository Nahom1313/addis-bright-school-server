import { Router } from 'express';
import { z } from 'zod';
import Quiz from '../models/Quiz.js';
import QuizAttempt from '../models/QuizAttempt.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/rbac.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = Router();
router.use(protect);

// ─── Validators ───────────────────────────────────────────────────
const questionSchema = z.object({
  questionText: z.string().min(1).max(500),
  options:      z.array(z.string().min(1).max(200)).min(2).max(6),
  correctIndex: z.number().int().min(0),
  points:       z.number().int().min(1).max(100).optional(),
}).refine(q => q.correctIndex < q.options.length, {
  message: 'correctIndex must point at one of the provided options.',
  path: ['correctIndex'],
});

const createSchema = z.object({
  subject:          z.string().min(1).max(100),
  title:            z.string().min(1).max(150),
  description:      z.string().max(1000).optional().nullable(),
  timeLimitMinutes: z.number().int().min(1).max(180).optional().nullable(),
  questions:        z.array(questionSchema).min(1).max(50),
});

const updateSchema = createSchema.partial();

const submitSchema = z.object({
  answers:          z.array(z.number().int().min(-1)).min(1),
  timeSpentSeconds: z.number().int().min(0).optional().nullable(),
});

// Strip correct answers before sending a quiz to a student who hasn't
// submitted it yet — never trust the client to keep this secret.
const stripAnswers = (quiz) => {
  const obj = quiz.toObject ? quiz.toObject() : quiz;
  return {
    ...obj,
    questions: obj.questions.map(({ correctIndex, ...q }) => q),
  };
};

const canSeeAnswers = (req, quiz) =>
  req.user.role === 'director' ||
  (req.user.role === 'teacher' && String(quiz.teacherId?._id || quiz.teacherId) === String(req.user._id));

// ─── GET /api/quizzes — everyone browses, filterable by subject ────
router.get('/', async (req, res, next) => {
  try {
    const { subject, q } = req.query;
    const filter = { isActive: true };
    if (subject) filter.subject = subject;
    if (q)       filter.title = { $regex: String(q).slice(0, 100), $options: 'i' };

    const quizzes = await Quiz.find(filter)
      .select('-questions.correctIndex') // never leak answers in list view
      .populate('teacherId', 'firstName lastName')
      .sort({ createdAt: -1 });

    // attach question count + total points without exposing answers
    const withMeta = quizzes.map(q => ({
      ...q.toObject(),
      questionCount: q.questions.length,
    }));

    sendSuccess(res, { quizzes: withMeta });
  } catch (err) { next(err); }
});

// ─── GET /api/quizzes/subjects ──────────────────────────────────────
router.get('/subjects', async (req, res, next) => {
  try {
    const subjects = await Quiz.distinct('subject', { isActive: true });
    sendSuccess(res, { subjects: subjects.sort() });
  } catch (err) { next(err); }
});

// ─── GET /api/quizzes/mine — teacher's own quizzes (with answers, for editing) ───
router.get('/mine', restrictTo('teacher'), async (req, res, next) => {
  try {
    const quizzes = await Quiz.find({ teacherId: req.user._id, isActive: true }).sort({ createdAt: -1 });
    sendSuccess(res, { quizzes });
  } catch (err) { next(err); }
});

// ─── GET /api/quizzes/:id — fetch one quiz to take (answers stripped for students) ───
router.get('/:id', async (req, res, next) => {
  try {
    const quiz = await Quiz.findById(req.params.id).populate('teacherId', 'firstName lastName');
    if (!quiz || !quiz.isActive) return sendError(res, 'Quiz not found.', 404);

    const safe = canSeeAnswers(req, quiz) ? quiz.toObject() : stripAnswers(quiz);
    sendSuccess(res, { quiz: safe });
  } catch (err) { next(err); }
});

// ─── GET /api/quizzes/:id/attempts/mine — student's own attempt history ───
router.get('/:id/attempts/mine', restrictTo('student'), async (req, res, next) => {
  try {
    const attempts = await QuizAttempt.find({ quizId: req.params.id, studentId: req.user._id }).sort({ createdAt: -1 });
    sendSuccess(res, { attempts });
  } catch (err) { next(err); }
});

// ─── GET /api/quizzes/:id/attempts — teacher/director sees everyone's results ───
router.get('/:id/attempts', restrictTo('teacher', 'director'), async (req, res, next) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz || !quiz.isActive) return sendError(res, 'Quiz not found.', 404);
    if (req.user.role === 'teacher' && String(quiz.teacherId) !== String(req.user._id)) {
      return sendError(res, 'You can only view results for your own quizzes.', 403);
    }

    // Most recent attempt per student
    const attempts = await QuizAttempt.aggregate([
      { $match: { quizId: quiz._id } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$studentId', best: { $first: '$$ROOT' }, attemptCount: { $sum: 1 } } },
      { $sort: { 'best.createdAt': -1 } },
    ]);

    const studentIds = attempts.map(a => a._id);
    const students = await User.find({ _id: { $in: studentIds } }).select('firstName lastName studentCode');
    const studentMap = Object.fromEntries(students.map(s => [String(s._id), s]));

    const results = attempts.map(a => ({
      student: studentMap[String(a._id)] || null,
      score: a.best.score,
      totalPoints: a.best.totalPoints,
      percentage: a.best.percentage,
      attemptCount: a.attemptCount,
      lastAttemptAt: a.best.createdAt,
    }));

    sendSuccess(res, { results });
  } catch (err) { next(err); }
});

// ─── POST /api/quizzes — teacher creates a quiz ─────────────────────
router.post('/', restrictTo('teacher'), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed', 422, parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
    }
    const quiz = await Quiz.create({ ...parsed.data, teacherId: req.user._id });
    sendSuccess(res, { quiz }, 'Quiz created.', 201);
  } catch (err) { next(err); }
});

// ─── PATCH /api/quizzes/:id — teacher edits their own quiz ─────────
router.patch('/:id', restrictTo('teacher'), async (req, res, next) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz || !quiz.isActive) return sendError(res, 'Quiz not found.', 404);
    if (String(quiz.teacherId) !== String(req.user._id)) {
      return sendError(res, 'You can only edit your own quizzes.', 403);
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed', 422, parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
    }

    Object.assign(quiz, parsed.data);
    await quiz.save();
    sendSuccess(res, { quiz }, 'Quiz updated.');
  } catch (err) { next(err); }
});

// ─── DELETE /api/quizzes/:id — teacher deletes their own quiz ──────
router.delete('/:id', restrictTo('teacher'), async (req, res, next) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz || !quiz.isActive) return sendError(res, 'Quiz not found.', 404);
    if (String(quiz.teacherId) !== String(req.user._id)) {
      return sendError(res, 'You can only delete your own quizzes.', 403);
    }
    quiz.isActive = false;
    await quiz.save();
    sendSuccess(res, {}, 'Quiz removed.');
  } catch (err) { next(err); }
});

// ─── POST /api/quizzes/:id/attempts — student submits answers, server grades ───
router.post('/:id/attempts', restrictTo('student'), async (req, res, next) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz || !quiz.isActive) return sendError(res, 'Quiz not found.', 404);

    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed', 422, parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
    }
    const { answers, timeSpentSeconds } = parsed.data;

    if (answers.length !== quiz.questions.length) {
      return sendError(res, `Expected ${quiz.questions.length} answers, got ${answers.length}.`, 422);
    }

    // Grade server-side — never trust a client-submitted score
    let score = 0;
    const totalPoints = quiz.questions.reduce((sum, q) => sum + (q.points || 1), 0);
    const review = quiz.questions.map((q, i) => {
      const selectedIndex = answers[i];
      const isCorrect = selectedIndex === q.correctIndex;
      if (isCorrect) score += (q.points || 1);
      return {
        questionText: q.questionText,
        options: q.options,
        correctIndex: q.correctIndex,
        selectedIndex,
        isCorrect,
        points: q.points || 1,
      };
    });
    const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;

    const attempt = await QuizAttempt.create({
      quizId: quiz._id,
      studentId: req.user._id,
      answers,
      score,
      totalPoints,
      percentage,
      timeSpentSeconds: timeSpentSeconds ?? null,
    });

    sendSuccess(res, {
      attempt: { _id: attempt._id, score, totalPoints, percentage, createdAt: attempt.createdAt },
      review,
    }, 'Quiz submitted!', 201);
  } catch (err) { next(err); }
});

export default router;
