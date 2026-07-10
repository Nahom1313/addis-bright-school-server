import { createError } from './errorHandler.js';

export const restrictTo = (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return next(createError(
        `Access denied. Requires one of: ${roles.join(', ')}.`, 403
      ));
    }
    next();
  };

export const isDirector   = restrictTo('director');
export const isRegistrar  = restrictTo('registrar');
export const isTeacher    = restrictTo('teacher');
export const isParent     = restrictTo('parent');
export const isStudent    = restrictTo('student');
export const isStaff      = restrictTo('director', 'teacher', 'registrar');
export const isAdmin      = restrictTo('director', 'registrar');
