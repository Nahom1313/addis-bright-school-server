import mongoose from 'mongoose';

const markSchema = new mongoose.Schema(
  {
    studentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sectionId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    teacherId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subject:    { type: String, required: true, trim: true },
    score:      { type: Number, required: true, min: 0 },
    maxScore:   { type: Number, required: true, min: 1, default: 100 },
    term:       { type: String, default: 'Term 1' },
  },
  { timestamps: true }
);

markSchema.index({ studentId: 1, subject: 1, term: 1 });
markSchema.index({ sectionId: 1, subject: 1 });

const Mark = mongoose.model('Mark', markSchema);
export default Mark;
