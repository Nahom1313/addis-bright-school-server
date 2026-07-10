import crypto from 'crypto';
import authService from '../services/authService.js';
import { sendSuccess, sendError } from '../utils/response.js';
import User from '../models/User.js';
import { sendResetEmail } from '../lib/mailer.js';

export const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    sendSuccess(res, result, 'Account created successfully.', 201);
  } catch (err) { next(err); }
};

export const login = async (req, res, next) => {
  try {
    const result = await authService.login({ email: req.body.email, password: req.body.password });
    sendSuccess(res, result);
  } catch (err) { next(err); }
};

export const me = async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user.id);
    sendSuccess(res, user);
  } catch (err) { next(err); }
};

// FIX: changePassword controller handler was missing entirely
export const changePassword = async (req, res, next) => {
  try {
    const result = await authService.changePassword(req.user._id, req.body);
    sendSuccess(res, result);
  } catch (err) { next(err); }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return sendError(res, 'Email is required.', 400);

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always respond 200 — prevents email enumeration attacks
    if (!user) {
      return sendSuccess(res, { message: 'If that email exists, a reset link has been sent.' });
    }

    const rawToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl  = `${clientUrl}/reset-password?token=${rawToken}`;

    try {
      await sendResetEmail(user.email, user.firstName, resetUrl);
    } catch (emailErr) {
      // Roll back token so the user can try again
      user.passwordResetToken   = null;
      user.passwordResetExpires = null;
      await user.save({ validateBeforeSave: false });
      return next(new Error('Failed to send reset email. Please try again later.'));
    }

    sendSuccess(res, { message: 'Reset link sent.' });
  } catch (err) { next(err); }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return sendError(res, 'Token and new password are required.', 400);
    if (password.length < 8)  return sendError(res, 'Password must be at least 8 characters.', 400);

    const hashed = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken:   hashed,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+passwordResetToken +passwordResetExpires +password');

    if (!user) return sendError(res, 'Token is invalid or has expired.', 400);

    user.password             = password;
    // FIX: Clear token fields first, then save — if save fails the token is still cleared
    // to prevent replay attacks even on partial failures
    user.passwordResetToken   = null;
    user.passwordResetExpires = null;

    try {
      await user.save();
    } catch (saveErr) {
      // Ensure token is invalidated even if password save fails
      await User.findByIdAndUpdate(user._id, {
        passwordResetToken: null,
        passwordResetExpires: null,
      });
      return next(saveErr);
    }

    sendSuccess(res, { message: 'Password reset successfully.' });
  } catch (err) { next(err); }
};

// FIX: Email verification handler
export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return sendError(res, 'Verification token is required.', 400);
    const result = await authService.verifyEmail(token);
    sendSuccess(res, result);
  } catch (err) { next(err); }
};
