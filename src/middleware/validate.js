import { sendError } from '../utils/response.js';

/**
 * validate(schema) — Zod schema validation middleware.
 * Validates req.body against the schema and returns 422 with field errors on failure.
 *
 * Usage:
 *   router.post('/login', validate(loginSchema), authController.login)
 */
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return sendError(res, 'Validation failed', 422, errors);
  }
  req.body = result.data; // use the parsed (coerced) data
  next();
};
