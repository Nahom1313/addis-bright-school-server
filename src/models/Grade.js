import mongoose from 'mongoose';

const gradeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Grade name is required'],
      trim: true,
      unique: true,
      maxlength: [50, 'Grade name must be 50 chars or fewer'],
      // e.g. "Grade 9", "Grade 10", "Kindergarten"
    },
    level: {
      type: Number,
      required: [true, 'Grade level is required'],
      min: [0, 'Level must be 0 or above'],
      max: [13, 'Level must be 13 or below'],
      // 0 = Kindergarten, 1-12 = standard grades
    },
    description: {
      type: String,
      trim: true,
      default: null,
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

// Virtual: populated sections (used in populated queries)
gradeSchema.virtual('sections', {
  ref:          'Section',
  localField:   '_id',
  foreignField: 'gradeId',
});

gradeSchema.index({ level: 1 });

const Grade = mongoose.model('Grade', gradeSchema);
export default Grade;
