import mongoose from 'mongoose';

const { Schema } = mongoose;

// A parent-submitted proof of a manual bank transfer. No money moves through
// this app — the parent pays directly at their own bank, then uploads a
// screenshot/photo of the receipt here for the registrar to verify.
const paymentSchema = new Schema(
  {
    parentId:  { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    amount:   { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'ETB' },
    bankName: { type: String, required: true, trim: true, maxlength: 100 },
    paidOn:   { type: Date, required: true },
    note:     { type: String, trim: true, maxlength: 500 },

    // Uploaded screenshot/photo of the receipt
    screenshotUrl:  { type: String, required: true },
    screenshotName: { type: String }, // original filename, for display

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    reviewedBy:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt:   { type: Date, default: null },
    reviewNote:   { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true }
);

paymentSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Payment', paymentSchema);
