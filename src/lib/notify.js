import Notification from '../models/Notification.js';
import { emitToUser }  from './socketEmitter.js';

/**
 * Create a persisted notification and push it to the user's socket room.
 *
 * @param {string|ObjectId} userId
 * @param {{ type: string, title: string, body: string, link?: string }} payload
 */
export async function notify(userId, { type, title, body, link = null }) {
  try {
    const doc = await Notification.create({ userId, type, title, body, link });
    emitToUser(userId, 'notification', {
      _id:       doc._id,
      type:      doc.type,
      title:     doc.title,
      body:      doc.body,
      link:      doc.link,
      read:      doc.read,
      createdAt: doc.createdAt,
    });
    return doc;
  } catch (err) {
    // Never crash the caller — notifications are best-effort
    console.error('[notify] failed:', err.message);
  }
}

/**
 * Notify multiple users at once.
 */
export async function notifyMany(userIds, payload) {
  return Promise.all(userIds.map(id => notify(id, payload)));
}
