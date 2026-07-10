import { Router } from 'express';
import { z } from 'zod';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/rbac.js';
import { handlePaymentUpload } from '../middleware/upload.js';
import { uploadLimiter } from '../config/rateLimits.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { audit } from '../lib/audit.js';
import { notifyMany } from '../lib/notify.js';

const router = Router();
router.use(protect);

// ─── Validators ───────────────────────────────────────────────────
// Note: these fields arrive as multipart/form-data strings alongside the
// file, so numbers/dates come through as strings — coerce them.
const submitSchema = z.object({
  studentId: z.string().length(24, 'Invalid student ID'),
  amount:    z.coerce.number().positive('Amount must be greater than 0'),
  bankName:  z.string().min(1).max(100),
  paidOn:    z.coerce.date(),
  note:      z.string().max(500).optional().nullable(),
});

const reviewSchema = z.object({
  status:     z.enum(['approved', 'rejected']),
  reviewNote: z.string().max(500).optional().nullable(),
});

// ─── Helpers ──────────────────────────────────────────────────────
const populatePayment = (q) =>
  q
    .populate('parentId', 'firstName lastName email phone')
    .populate('studentId', 'firstName lastName studentCode')
    .populate('reviewedBy', 'firstName lastName');

// ─── POST /api/payments ─────────────────────────────────────────────
// Parent uploads a screenshot/photo of a manual bank transfer receipt.
router.post('/', restrictTo('parent'), uploadLimiter, handlePaymentUpload, async (req, res, next) => {
  try {
    if (!req.file) return sendError(res, 'A screenshot or photo of the receipt is required.', 400);

    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, parsed.error.issues[0]?.message || 'Invalid submission.', 400, parsed.error.issues);
    }
    const { studentId, amount, bankName, paidOn, note } = parsed.data;

    // A parent can only submit payment proof for their own linked child.
    const parent = await User.findById(req.user._id);
    const isOwnChild = parent.studentIds?.map(String).includes(String(studentId));
    if (!isOwnChild) return sendError(res, 'This student is not linked to your account.', 403);

    const payment = await Payment.create({
      parentId: req.user._id,
      studentId,
      amount,
      bankName,
      paidOn,
      note: note || '',
      screenshotUrl:  req.file.filename,  // full Cloudinary URL
      screenshotName: req.file.originalname,
    });

    const populated = await populatePayment(Payment.findById(payment._id));

    audit(req, 'SUBMIT_PAYMENT', 'Payment', payment._id, { studentId, amount, bankName });

    // Let registrars and the director know a new receipt is waiting for review.
    const reviewers = await User.find({ role: { $in: ['registrar', 'director'] }, isActive: true }).select('_id');
    const parentName = `${req.user.firstName} ${req.user.lastName}`;
    await notifyMany(reviewers.map(r => r._id), {
      type: 'payment',
      title: 'New payment receipt submitted',
      body: `${parentName} uploaded a receipt for review.`,
      link: '/registrar/payments',
    });

    sendSuccess(res, { payment: populated }, 'Receipt submitted. The registrar will review it shortly.', 201);
  } catch (err) { next(err); }
});

// ─── GET /api/payments/mine ─────────────────────────────────────────
// Parent's own submission history.
router.get('/mine', restrictTo('parent'), async (req, res, next) => {
  try {
    const payments = await populatePayment(
      Payment.find({ parentId: req.user._id }).sort({ createdAt: -1 })
    );
    sendSuccess(res, { payments });
  } catch (err) { next(err); }
});

// ─── GET /api/payments ───────────────────────────────────────────────
// Registrar/director: full list, optionally filtered by status.
router.get('/', restrictTo('registrar', 'director'), async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = status && status !== 'all' ? { status } : {};
    const payments = await populatePayment(
      Payment.find(filter).sort({ createdAt: -1 })
    );
    sendSuccess(res, { payments });
  } catch (err) { next(err); }
});

// ─── PATCH /api/payments/:id/review ──────────────────────────────────
// Registrar/director approves or rejects a submitted receipt.
router.patch('/:id/review', restrictTo('registrar', 'director'), async (req, res, next) => {
  try {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, parsed.error.issues[0]?.message || 'Invalid review.', 400, parsed.error.issues);
    }
    const { status, reviewNote } = parsed.data;

    const payment = await Payment.findById(req.params.id);
    if (!payment) return sendError(res, 'Payment not found.', 404);
    if (payment.status !== 'pending') {
      return sendError(res, `This receipt was already ${payment.status}.`, 409);
    }

    payment.status     = status;
    payment.reviewNote = reviewNote || '';
    payment.reviewedBy = req.user._id;
    payment.reviewedAt = new Date();
    await payment.save();

    const populated = await populatePayment(Payment.findById(payment._id));

    audit(req, 'REVIEW_PAYMENT', 'Payment', payment._id, { status, reviewNote });

    await notifyMany([payment.parentId], {
      type: 'payment',
      title: status === 'approved' ? 'Payment confirmed' : 'Payment needs attention',
      body: status === 'approved'
        ? 'Your payment receipt was approved.'
        : `Your payment receipt was rejected.${reviewNote ? ` Reason: ${reviewNote}` : ''}`,
      link: '/parent/payment',
    });

    sendSuccess(res, { payment: populated }, `Receipt ${status}.`);
  } catch (err) { next(err); }
});

// ─── DELETE /api/payments/:id ────────────────────────────────────────
// Parent can withdraw a submission only while it's still pending
// (e.g. they uploaded the wrong screenshot by mistake).
router.delete('/:id', restrictTo('parent'), async (req, res, next) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, parentId: req.user._id });
    if (!payment) return sendError(res, 'Payment not found.', 404);
    if (payment.status !== 'pending') {
      return sendError(res, 'Only a pending submission can be removed.', 409);
    }
    await payment.deleteOne();
    sendSuccess(res, {}, 'Submission removed.');
  } catch (err) { next(err); }
});

export default router;
