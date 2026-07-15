import { Router } from 'express';
import { login, register, me, forgotPassword, resetPassword, changePassword, verifyEmail } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, registerSchema, changePasswordSchema } from '../validators/authValidators.js';

const router = Router();

// Rate limiting for these routes is applied in app.js at the mount point
// (authLimiter for login/register, the stricter passwordResetLimiter for
// forgot/reset-password) — not duplicated here, to avoid two different
// limiters with different windows silently stacking on the same route.
router.post('/register',        validate(registerSchema),       register);
router.post('/login',           validate(loginSchema),           login);
router.get('/me',               protect,                                       me);
// FIX: Client calls POST /auth/logout on sign-out; since JWTs are stateless this is a no-op
// confirmation endpoint (kept for future token-blacklisting support).
router.post('/logout',          protect, (req, res) => {
  res.json({ success: true, message: 'Logged out.' });
});
router.post('/forgot-password',                                   forgotPassword);
router.post('/reset-password',                                    resetPassword);
// FIX: Wire up the changePassword route that was implemented but never exposed
router.get('/verify-email',   verifyEmail);
router.patch('/change-password', protect, validate(changePasswordSchema),     changePassword);

// Register/unregister FCM push token for this device
import User from '../models/User.js';

router.post('/fcm-token', protect, async (req, res, next) => {
  try {
    const { token, action = 'add' } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'token is required' });

    if (action === 'remove') {
      await User.findByIdAndUpdate(req.user._id, { $pull: { fcmTokens: token } });
    } else {
      // Keep max 5 tokens per user (one per device)
      await User.findByIdAndUpdate(req.user._id, {
        $addToSet: { fcmTokens: token },
      });
      // Trim to 5 most recent
      const user = await User.findById(req.user._id).select('+fcmTokens');
      if (user.fcmTokens.length > 5) {
        user.fcmTokens = user.fcmTokens.slice(-5);
        await user.save({ validateBeforeSave: false });
      }
    }
    res.json({ success: true, message: action === 'remove' ? 'Token removed.' : 'Token registered.' });
  } catch (err) { next(err); }
});

export default router;
