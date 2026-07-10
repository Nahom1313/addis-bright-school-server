import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Event title is required'],
      trim: true,
      maxlength: [120, 'Title must be 120 chars or fewer'],
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    // Scope: 'school' = visible to everyone, 'section' = only that section
    scope: {
      type: String,
      enum: ['school', 'section'],
      default: 'school',
    },
    // If scope = 'section', which section
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      default: null,
    },
    // If scope = 'section', which grade (for convenient filtering)
    gradeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Grade',
      default: null,
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      default: null,
    },
    category: {
      type: String,
      enum: ['holiday', 'exam', 'meeting', 'sports', 'cultural', 'deadline', 'other'],
      default: 'other',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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

eventSchema.index({ startDate: 1 });
eventSchema.index({ scope: 1, sectionId: 1 });
eventSchema.index({ startDate: 1, isActive: 1 });   // upcoming active events

const Event = mongoose.model('Event', eventSchema);
export default Event;
