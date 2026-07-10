import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!SECRET && process.env.NODE_ENV !== 'test') {
  throw new Error('JWT_SECRET is not set in environment variables');
}

/**
 * Sign a JWT for a user.
 * Payload includes: id, role, firstName — enough for the client without
 * exposing sensitive data or bloating the token.
 */
export const signToken = (user) =>
  jwt.sign(
    {
      id: user._id,
      role: user.role,
      firstName: user.firstName,
    },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );

/**
 * Verify and decode a JWT. Throws if invalid or expired.
 */
export const verifyToken = (token) => jwt.verify(token, SECRET);
