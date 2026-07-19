import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema(
  {
    questionText: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
      maxlength: [500, 'Question must be 500 chars or fewer'],
    },
    options: {
      type: [{ type: String, trim: true, maxlength: 200 }],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length >= 2 && arr.length <= 6,
        message: 'Each question needs between 2 and 6 options.',
      },
      required: true,
    },
    correctIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    points: {
      type: Number,
      default: 1,
      min: 1,
      max: 100,
    },
  },
  { _id: true }
);

// correctIndex must actually point at one of the options
questionSchema.pre('validate', function (next) {
  if (this.options && this.correctIndex >= this.options.length) {
    return next(new Error('correctIndex must point at one of the provided options.'));
  }
  next();
});

const quizSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
      maxlength: [1000, 'Description must be 1000 chars or fewer'],
      default: null,
    },
    // null = no time limit
    timeLimitMinutes: {
      type: Number,
      default: null,
      min: 1,
      max: 180,
    },
    questions: {
      type: [questionSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length >= 1 && arr.length <= 50,
        message: 'A quiz needs between 1 and 50 questions.',
      },
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

quizSchema.virtual('totalPoints').get(function () {
  return (this.questions || []).reduce((sum, q) => sum + (q.points || 1), 0);
});
quizSchema.set('toJSON', { virtuals: true });
quizSchema.set('toObject', { virtuals: true });

quizSchema.index({ subject: 1, createdAt: -1 });
quizSchema.index({ teacherId: 1, createdAt: -1 });

const Quiz = mongoose.model('Quiz', quizSchema);
export default Quiz;
