import crypto from 'crypto';
import userRepository from '../repositories/userRepository.js';
import { signToken } from '../utils/jwt.js';
import { createError } from '../middleware/errorHandler.js';
import { sendVerificationEmail } from '../lib/mailer.js';
import User from '../models/User.js';

class AuthService {
  async register({ firstName, lastName, email, password, role }) {
    const exists = await userRepository.emailExists(email);
    if (exists) {
      throw createError('An account with this email already exists.', 409);
    }

    const user = await userRepository.create({ firstName, lastName, email, password, role });

    // FIX: Send email verification — fire-and-forget, don't block registration
    try {
      const rawToken = user.createEmailVerifyToken();
      await user.save({ validateBeforeSave: false });
      const clientUrl  = process.env.CLIENT_URL || 'http://localhost:5173';
      const verifyUrl  = `${clientUrl}/verify-email?token=${rawToken}`;
      sendVerificationEmail(user.email, user.firstName, verifyUrl).catch(() => {});
    } catch (e) {
      console.warn('[Auth] Could not send verification email:', e.message);
    }

    const token = signToken(user);
    return { user: user.toSafeObject(), token };
  }

  async login({ email, password }) {
    const user = await userRepository.findByEmail(email, true);

    if (!user) {
      throw createError('Invalid email or password.', 401);
    }

    if (!user.isActive) {
      throw createError('Your account has been deactivated. Contact the school administrator.', 403);
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw createError('Invalid email or password.', 401);
    }

    userRepository.touchLogin(user._id).catch(() => {});

    const token = signToken(user);
    return { user: user.toSafeObject(), token };
  }

  async getMe(userId) {
    const user = await User.findById(userId)
      .select('-password')
      .populate('studentIds', 'firstName lastName studentCode profilePicture sectionId');
    if (!user) throw createError('User not found.', 404);
    return { user: user.toSafeObject ? user.toSafeObject() : user };
  }

  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await userRepository.findById(userId, '+password');
    if (!user) throw createError('User not found.', 404);

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) throw createError('Current password is incorrect.', 401);

    user.password = newPassword;
    await user.save();

    return { message: 'Password updated successfully.' };
  }

  // FIX: Email verification handler
  async verifyEmail(token) {
    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      emailVerifyToken:   hashed,
      emailVerifyExpires: { $gt: Date.now() },
    }).select('+emailVerifyToken +emailVerifyExpires');

    if (!user) throw createError('Verification link is invalid or has expired.', 400);

    user.emailVerified      = true;
    user.emailVerifyToken   = null;
    user.emailVerifyExpires = null;
    await user.save({ validateBeforeSave: false });

    return { message: 'Email verified successfully.' };
  }
}

export default new AuthService();
