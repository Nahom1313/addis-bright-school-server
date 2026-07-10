import AuditLog from '../models/AuditLog.js';

/**
 * Fire-and-forget audit log writer.
 * Never throws — audit failures should not block the main operation.
 *
 * Usage:
 *   audit(req, 'CREATE_USER', 'User', newUser._id, { role: 'teacher' });
 */
export const audit = (req, action, targetModel = null, targetId = null, meta = null) => {
  if (!req?.user) return;
  AuditLog.create({
    actorId:     req.user._id,
    actorRole:   req.user.role,
    action,
    targetModel,
    targetId:    targetId || null,
    meta,
    ip:          req.ip || req.headers['x-forwarded-for'] || null,
  }).catch(err => console.error('[Audit] Failed to write log:', err.message));
};
