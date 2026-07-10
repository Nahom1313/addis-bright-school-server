import { Router } from 'express';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();
router.use(protect);

// GET /api/notifications — latest 40 for the logged-in user
router.get('/', async (req, res, next) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(40);
    const unreadCount = await Notification.countDocuments({ userId: req.user._id, read: false });
    sendSuccess(res, { notifications, unreadCount });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/:id/read — mark one as read
router.patch('/:id/read', async (req, res, next) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { read: true }
    );
    sendSuccess(res, {}, 'Marked as read.');
  } catch (err) { next(err); }
});

// PATCH /api/notifications/read-all — mark all as read
router.patch('/read-all', async (req, res, next) => {
  try {
    await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
    sendSuccess(res, {}, 'All marked as read.');
  } catch (err) { next(err); }
});

// DELETE /api/notifications/:id — delete one
router.delete('/:id', async (req, res, next) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    sendSuccess(res, {}, 'Deleted.');
  } catch (err) { next(err); }
});

export default router;
