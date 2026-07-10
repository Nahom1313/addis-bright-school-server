/**
 * Send a successful JSON response.
 * Shape: { success: true, message?, data?, meta? }
 */
export const sendSuccess = (res, data = {}, message = 'Success', statusCode = 200, meta = null) => {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
};

/**
 * Send an error JSON response.
 * Shape: { success: false, message, errors? }
 */
export const sendError = (res, message = 'Something went wrong', statusCode = 500, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};
