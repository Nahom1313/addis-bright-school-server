import mongoose from 'mongoose';

const teacherAssignmentSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Teacher is required'],
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      required: [true, 'Section is required'],
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
      maxlength: [100, 'Subject must be 100 chars or fewer'],
      // e.g. "Mathematics", "English Language", "Physics"
    },
    academicYear: {
      type: String,
      required: [true, 'Academic year is required'],
      trim: true,
      match: [/^\d{4}\/\d{4}$/, 'Academic year must be in format YYYY/YYYY (e.g. 2024/2025)'],
      default: () => {
        const y = new Date().getFullYear();
        return `${y}/${y + 1}`;
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Prevent the same teacher teaching the same subject in the same section/year
teacherAssignmentSchema.index(
  { teacherId: 1, sectionId: 1, subject: 1, academicYear: 1 },
  { unique: true }
);
teacherAssignmentSchema.index({ teacherId: 1 });
teacherAssignmentSchema.index({ sectionId: 1 });

const TeacherAssignment = mongoose.model('TeacherAssignment', teacherAssignmentSchema);
export default TeacherAssignment;
