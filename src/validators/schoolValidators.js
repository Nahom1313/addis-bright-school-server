import { z } from 'zod';

// ─── Grade ────────────────────────────────────────────────────────
export const createGradeSchema = z.object({
  name:        z.string().min(1).max(50),
  level:       z.number().int().min(0).max(13),
  description: z.string().max(200).optional(),
});

export const updateGradeSchema = createGradeSchema.partial();

// ─── Section ──────────────────────────────────────────────────────
export const createSectionSchema = z.object({
  name:     z.string().min(1).max(10),
  gradeId:  z.string().length(24, 'Invalid grade ID'),
  capacity: z.number().int().min(1).max(100).optional(),
  room:     z.string().max(50).optional(),
});

export const updateSectionSchema = createSectionSchema.omit({ gradeId: true }).partial();

// ─── Users (Director creates all roles) ───────────────────────────
const baseUserSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName:  z.string().min(1).max(50),
  email:     z.string().email(),
  password:  z.string().min(8)
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  phone:     z.string().max(20).optional(),
});

export const createTeacherSchema = baseUserSchema;

export const createStudentSchema = baseUserSchema.extend({
  sectionId:   z.string().length(24).optional(),
  studentCode: z.string().max(30).optional(),
});

export const createParentSchema = baseUserSchema.extend({
  studentIds: z.array(z.string().length(24)).optional().default([]),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName:  z.string().min(1).max(50).optional(),
  phone:     z.string().max(20).optional(),
  avatarUrl: z.string().url().optional(),
  email:     z.string().email('Invalid email').optional(),
  password:  z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number')
    .optional(),
});

// ─── Teacher Assignment ────────────────────────────────────────────
export const assignTeacherSchema = z.object({
  teacherId:    z.string().length(24, 'Invalid teacher ID'),
  sectionId:    z.string().length(24, 'Invalid section ID'),
  subject:      z.string().min(1).max(100),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Format: YYYY/YYYY').optional(),
});

// ─── School Info ───────────────────────────────────────────────────
export const updateSchoolInfoSchema = z.object({
  schoolName:          z.string().min(1).max(100).optional(),
  address:             z.string().max(200).optional(),
  phone:               z.string().max(20).optional(),
  email:               z.string().email().optional(),
  currentAcademicYear: z.string().regex(/^\d{4}\/\d{4}$/).optional(),
  tuitionAmount:       z.number().min(0).optional(),
  currency:            z.string().length(3).optional(),
});

export const bankAccountSchema = z.object({
  bankName:      z.string().min(1).max(50),
  accountName:   z.string().min(1).max(100),
  accountNumber: z.string().min(1).max(50),
  branch:        z.string().max(100).optional(),
  notes:         z.string().max(200).optional(),
});

// ─── Enroll student in section ────────────────────────────────────
export const enrollStudentSchema = z.object({
  sectionId: z.string().length(24, 'Invalid section ID'),
});

// ─── Link parent to student ───────────────────────────────────────
export const linkParentSchema = z.object({
  studentId: z.string().length(24, 'Invalid student ID'),
});

// ─── Bulk student import ──────────────────────────────────────────
const bulkStudentRowSchema = z.object({
  firstName:   z.string().min(1).max(50),
  lastName:    z.string().min(1).max(50),
  email:       z.string().email(),
  password:    z.string().min(8),
  phone:       z.string().max(20).optional(),
  sectionId:   z.string().length(24).optional(),
  studentCode: z.string().max(30).optional(),
});

export const bulkCreateStudentsSchema = z.object({
  students: z.array(bulkStudentRowSchema).min(1).max(200),
});
