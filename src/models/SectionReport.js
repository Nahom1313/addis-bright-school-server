import mongoose from 'mongoose';

const studentSnapshotSchema = new mongoose.Schema({
  studentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  firstName:   String,
  lastName:    String,
  studentCode: String,
  marks: [{
    subject:  String,
    score:    Number,
    maxScore: Number,
    term:     String,
    pct:      Number,
  }],
  avgPct:          Number,
  attendanceTotal: Number,
  attendantDays:   Number,
  rank:            Number,
}, { _id: false });

const sectionReportSchema = new mongoose.Schema(
  {
    sectionId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Section',  required: true },
    classLeaderId:{ type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },
    term:         { type: String, required: true, trim: true },
    note:         { type: String, trim: true, maxlength: 1000, default: null },

    students: [studentSnapshotSchema],

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    reviewedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt:   { type: Date, default: null },
    feedback:     { type: String, trim: true, maxlength: 1000, default: null },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

sectionReportSchema.index({ sectionId: 1, term: 1 });
sectionReportSchema.index({ classLeaderId: 1 });
sectionReportSchema.index({ status: 1 });

const SectionReport = mongoose.model('SectionReport', sectionReportSchema);
export default SectionReport;
