import { z } from 'zod';

export const createEventSchema = z.object({
  title:       z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  scope:       z.enum(['school', 'section']).default('school'),
  sectionId:   z.string().length(24).optional().nullable(),
  gradeId:     z.string().length(24).optional().nullable(),
  startDate:   z.coerce.date(),
  endDate:     z.coerce.date().optional().nullable(),
  category:    z.enum(['holiday', 'exam', 'meeting', 'sports', 'cultural', 'deadline', 'other']).default('other'),
});

export const updateEventSchema = createEventSchema.partial();
