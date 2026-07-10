import { Router } from 'express';
import Announcement from '../models/Announcement.js';
import User         from '../models/User.js';
import { protect }  from '../middleware/auth.js';
import { restrictTo } from '../middleware/rbac.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { notifyMany } from '../lib/notify.js';

const router = Router();
router.use(protect);

// GET /api/announcements — each role sees only announcements targeted at them
router.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const announcements = await Announcement.find({
      isActive: true,
      targetRoles: req.user.role,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    })
      .populate('createdBy', 'firstName lastName')
      .sort({ priority: -1, createdAt: -1 })
      .limit(10);

    sendSuccess(res, { announcements });
  } catch (e) { next(e); }
});

// GET /api/announcements/all — director sees everything they posted
router.get('/all', restrictTo('director'), async (req, res, next) => {
  try {
    const announcements = await Announcement.find({ createdBy: req.user._id })
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 });
    sendSuccess(res, { announcements });
  } catch (e) { next(e); }
});

// POST /api/announcements — director creates
router.post('/', restrictTo('director'), async (req, res, next) => {
  try {
    const { title, body, priority, targetRoles, expiresAt } = req.body;

    if (!title?.trim())           return sendError(res, 'Title is required.', 400);
    if (!body?.trim())            return sendError(res, 'Body is required.', 400);
    if (!targetRoles?.length)     return sendError(res, 'Select at least one target role.', 400);

    const announcement = await Announcement.create({
      title: title.trim(),
      body:  body.trim(),
      priority: priority || 'normal',
      targetRoles,
      createdBy: req.user._id,
      expiresAt: expiresAt || null,
    });

    // Notify all users in the targeted roles
    const users = await User.find({
      role: { $in: targetRoles },
      isActive: true,
    }).select('_id');

    const roleLabel = targetRoles.length >= 5
      ? 'everyone'
      : targetRoles.join(', ');

    await notifyMany(users.map(u => u._id), {
      type:  'announcement',
      title: priority === 'urgent' ? `🚨 ${title}` : `📢 ${title}`,
      body:  body.slice(0, 120),
      link:  null, // shows on dashboard
    });

    sendSuccess(res, { announcement }, 'Announcement posted.', 201);
  } catch (e) { next(e); }
});

// PATCH /api/announcements/:id/deactivate — director removes
router.patch('/:id/deactivate', restrictTo('director'), async (req, res, next) => {
  try {
    const a = await Announcement.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!a) return sendError(res, 'Announcement not found.', 404);
    a.isActive = false;
    await a.save();
    sendSuccess(res, {}, 'Announcement removed.');
  } catch (e) { next(e); }
});

export default router;
