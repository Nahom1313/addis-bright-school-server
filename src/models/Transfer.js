import mongoose from 'mongoose';

const transferSchema = new mongoose.Schema(
  {
    studentId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
    fromSectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', default: null },
    toSectionId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    reason:        { type: String, trim: true, maxlength: 500, default: null },
    transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
  },
  { timestamps: true }
);

transferSchema.index({ studentId: 1, createdAt: -1 });

const Transfer = mongoose.model('Transfer', transferSchema);
export default Transfer;
