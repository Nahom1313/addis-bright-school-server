import { z } from 'zod';

export const createStatusLogSchema = z.object({
  studentId: z.string().length(24, 'Invalid student ID'),
  sectionId: z.string().length(24, 'Invalid section ID'),
  rawNote:   z.string()
    .min(3, 'Note must be at least 3 characters')
    .max(500, 'Note must be 500 characters or fewer'),
});
