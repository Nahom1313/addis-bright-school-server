import mongoose from 'mongoose';

const homeworkSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      required: true,
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
      maxlength: [100, 'Subject must be 100 chars or fewer'],
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [150, 'Title must be 150 chars or fewer'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description must be 2000 chars or fewer'],
      default: null,
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
    },
    // Optional link to external resource (Google Docs, Drive, etc.)
    resourceUrl: {
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

// Virtual: whether the homework is past due
homeworkSchema.virtual('isOverdue').get(function () {
  return new Date() > new Date(this.dueDate);
});

// Virtual: days remaining (negative = overdue)
homeworkSchema.virtual('daysUntilDue').get(function () {
  const diff = new Date(this.dueDate) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

homeworkSchema.index({ sectionId: 1, dueDate: -1 });
homeworkSchema.index({ teacherId: 1, dueDate: -1 });
homeworkSchema.index({ sectionId: 1, subject: 1 });

const Homework = mongoose.model('Homework', homeworkSchema);
export default Homework;
