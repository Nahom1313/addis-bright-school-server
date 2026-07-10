import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/rbac.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { emitToUser } from '../lib/socketEmitter.js';
import { sendPush }   from '../lib/pushNotification.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

const router = Router();
router.use(protect);
router.use(restrictTo('parent', 'teacher', 'director'));

// ─── GET /api/messages/conversations ─────────────────────────────
// List all conversations for the current user
router.get('/conversations', async (req, res, next) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
    })
      .populate('participants', 'firstName lastName role profilePicture')
      .populate('studentId', 'firstName lastName studentCode')
      .sort({ lastMessageAt: -1 })
      .lean();

    // Attach unread count for this user
    const result = conversations.map(c => ({
      ...c,
      myUnread: c.unreadCount?.[String(req.user._id)] || 0,
    }));

    sendSuccess(res, { conversations: result });
  } catch (err) { next(err); }
});

// ─── POST /api/messages/conversations ────────────────────────────
// Start or get existing conversation between parent and teacher
router.post('/conversations', async (req, res, next) => {
  try {
    const { teacherId, studentId } = req.body;
    const userId = String(req.user._id);
    const role   = req.user.role;

    // Determine the two participants
    let parentId, tId;
    if (role === 'parent') {
      parentId = userId;
      tId      = teacherId;
      if (!tId) return sendError(res, 'teacherId is required.', 400);
    } else if (role === 'teacher') {
      tId      = userId;
      parentId = teacherId; // actually parentId in this case
      if (!parentId) return sendError(res, 'parentId is required.', 400);
    } else {
      return sendError(res, 'Only parents and teachers can start conversations.', 403);
    }

    // Validate both exist
    const [parent, teacher] = await Promise.all([
      User.findOne({ _id: parentId, role: 'parent', isActive: true }),
      User.findOne({ _id: tId,      role: 'teacher', isActive: true }),
    ]);
    if (!parent)  return sendError(res, 'Parent not found.',  404);
    if (!teacher) return sendError(res, 'Teacher not found.', 404);

    // Find or create conversation
    let conversation = await Conversation.findOne({
      participants: { $all: [parentId, tId], $size: 2 },
      ...(studentId ? { studentId } : {}),
    })
      .populate('participants', 'firstName lastName role profilePicture')
      .populate('studentId', 'firstName lastName studentCode');

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [parentId, tId],
        studentId: studentId || null,
      });
      conversation = await Conversation.findById(conversation._id)
        .populate('participants', 'firstName lastName role profilePicture')
        .populate('studentId', 'firstName lastName studentCode');
    }

    sendSuccess(res, { conversation }, 'Conversation ready.', 200);
  } catch (err) { next(err); }
});

// ─── GET /api/messages/:conversationId ───────────────────────────
// Get messages in a conversation (paginated)
router.get('/:conversationId', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Verify user is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id,
    });
    if (!conversation) return sendError(res, 'Conversation not found.', 404);

    const skip = (Number(page) - 1) * Number(limit);
    const [messages, total] = await Promise.all([
      Message.find({ conversationId, deleted: false })
        .populate('senderId', 'firstName lastName role profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Message.countDocuments({ conversationId, deleted: false }),
    ]);

    // Mark messages as read for this user
    await Message.updateMany(
      { conversationId, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );

    // Reset unread count for this user
    await Conversation.findByIdAndUpdate(conversationId, {
      $set: { [`unreadCount.${req.user._id}`]: 0 },
    });

    sendSuccess(res, {
      messages: messages.reverse(), // oldest first
      total,
      page: Number(page),
      hasMore: skip + messages.length < total,
    });
  } catch (err) { next(err); }
});

// ─── POST /api/messages/:conversationId ──────────────────────────
// Send a message
router.post('/:conversationId', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { body } = req.body;

    if (!body?.trim()) return sendError(res, 'Message body is required.', 400);
    if (body.length > 2000) return sendError(res, 'Message too long (max 2000 chars).', 400);

    // Verify user is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id,
    });
    if (!conversation) return sendError(res, 'Conversation not found.', 404);

    // Create message
    const message = await Message.create({
      conversationId,
      senderId: req.user._id,
      body:     body.trim(),
      readBy:   [req.user._id],
    });

    const populated = await Message.findById(message._id)
      .populate('senderId', 'firstName lastName role profilePicture');

    // Update conversation metadata + increment unread for OTHER participant
    const otherId = conversation.participants.find(
      p => String(p) !== String(req.user._id)
    );

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage:   body.trim().slice(0, 100),
      lastMessageAt: new Date(),
      lastMessageBy: req.user._id,
      $inc: { [`unreadCount.${otherId}`]: 1 },
    });

    // Real-time socket push
    emitToUser(otherId, 'new_message', { conversationId, message: populated });

    // Firebase push when app is closed
    const otherUser = await User.findById(otherId).select('+fcmTokens');
    if (otherUser?.fcmTokens?.length) {
      const senderName = `${req.user.firstName} ${req.user.lastName}`;
      await sendPush(otherUser.fcmTokens, {
        title: `New message from ${senderName}`,
        body:  body.trim().slice(0, 100),
        data:  { type: 'message', conversationId: String(conversationId) },
      });
    }

    sendSuccess(res, { message: populated }, 'Message sent.', 201);
  } catch (err) { next(err); }
});

// ─── DELETE /api/messages/:conversationId/:messageId ─────────────
router.delete('/:conversationId/:messageId', async (req, res, next) => {
  try {
    const message = await Message.findOne({
      _id:    req.params.messageId,
      senderId: req.user._id,
      conversationId: req.params.conversationId,
    });
    if (!message) return sendError(res, 'Message not found or not yours.', 404);

    message.deleted = true;
    message.body    = 'This message was deleted.';
    await message.save();

    const otherId = (await Conversation.findById(req.params.conversationId))
      ?.participants.find(p => String(p) !== String(req.user._id));
    if (otherId) emitToUser(otherId, 'message_deleted', { messageId: req.params.messageId, conversationId: req.params.conversationId });

    sendSuccess(res, {}, 'Message deleted.');
  } catch (err) { next(err); }
});

export default router;
