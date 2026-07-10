import mongoose from 'mongoose';

const statusLogSchema = new mongoose.Schema(
  {
    // Who wrote it
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // About which student
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Which section context (denormalised for fast queries)
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      required: true,
    },

    // ─── Teacher input ───────────────────────────────────────────
    rawNote: {
      type: String,
      required: [true, 'Raw note is required'],
      trim: true,
      maxlength: [500, 'Raw note must be 500 chars or fewer'],
    },

    // ─── AI-enriched output ──────────────────────────────────────
    // Whether AI enrichment has completed
    enriched: {
      type: Boolean,
      default: false,
    },
    // One-sentence parent-friendly summary
    summary: {
      type: String,
      default: null,
    },
    // Sentiment bucket: positive | neutral | concern
    tone: {
      type: String,
      enum: ['positive', 'neutral', 'concern'],
      default: 'neutral',
    },
    // Optional suggestion for the parent
    suggestedAction: {
      type: String,
      default: null,
    },
    // Category tag chosen by AI
    category: {
      type: String,
      enum: ['attendance', 'behaviour', 'academic', 'social', 'health', 'general'],
      default: 'general',
    },

    // If AI enrichment failed, store the error so we can retry
    enrichmentError: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes optimised for the two main query patterns:
//   1. Parent reads their child's feed (studentId + time desc)
//   2. Teacher views logs they created (teacherId + time desc)
statusLogSchema.index({ studentId: 1, createdAt: -1 });
statusLogSchema.index({ teacherId: 1, createdAt: -1 });
statusLogSchema.index({ sectionId: 1, createdAt: -1 });

const StatusLog = mongoose.model('StatusLog', statusLogSchema);
export default StatusLog;
