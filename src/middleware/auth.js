import { verifyToken } from '../utils/jwt.js';
import { createError } from './errorHandler.js';
import User from '../models/User.js';

/**
 * Core auth middleware.
 * Verifies Bearer token, loads user, attaches to req.user.
 *
 * Exported as BOTH `protect` and `authenticate` so every route
 * file works regardless of which name it imports — no more
 * mismatched export errors.
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return next(createError('No token provided. Please log in.', 401));
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token); // throws on invalid/expired

    const user = await User.findById(decoded.id).select('-password -passwordResetToken -passwordResetExpires');
    if (!user) {
      return next(createError('User no longer exists.', 401));
    }
    if (!user.isActive) {
      return next(createError('Your account has been deactivated. Contact the school administrator.', 403));
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

// Both names exported — use whichever you prefer in route files
export const protect      = authMiddleware;
export const authenticate = authMiddleware;
