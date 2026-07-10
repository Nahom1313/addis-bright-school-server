import mongoose from 'mongoose';

const sectionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Section name is required'],
      trim: true,
      maxlength: [10, 'Section name must be 10 chars or fewer'],
      // e.g. "A", "B", "C"
    },
    gradeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Grade',
      required: [true, 'Grade is required'],
    },
    capacity: {
      type: Number,
      default: 40,
      min: [1, 'Capacity must be at least 1'],
      max: [100, 'Capacity must be 100 or fewer'],
    },
    room: {
      type: String,
      trim: true,
      default: null,
      // e.g. "Room 201"
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    classLeaderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      // The teacher assigned as class leader (homeroom teacher) of this section
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound unique: no duplicate section names within the same grade
sectionSchema.index({ gradeId: 1, name: 1 }, { unique: true });
sectionSchema.index({ gradeId: 1 });

// Virtual: the grade document
sectionSchema.virtual('grade', {
  ref:         'Grade',
  localField:  'gradeId',
  foreignField: '_id',
  justOne:     true,
});

// Virtual: enrolled students count
sectionSchema.virtual('studentCount', {
  ref:         'User',
  localField:  '_id',
  foreignField: 'sectionId',
  count:       true,
});

const Section = mongoose.model('Section', sectionSchema);
export default Section;
