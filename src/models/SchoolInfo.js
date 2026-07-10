import mongoose from 'mongoose';

const bankAccountSchema = new mongoose.Schema(
  {
    bankName:      { type: String, required: true, trim: true },  // e.g. "CBE", "Telebirr"
    accountName:   { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
    branch:        { type: String, trim: true, default: null },
    notes:         { type: String, trim: true, default: null },   // e.g. "For tuition payments only"
  },
  { _id: false }
);

const schoolInfoSchema = new mongoose.Schema(
  {
    // Enforce singleton — always _id = 'singleton'
    _id: { type: String, default: 'singleton' },

    schoolName: {
      type: String,
      required: [true, 'School name is required'],
      trim: true,
    },
    address: {
      type: String,
      trim: true,
      default: null,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    logoUrl: {
      type: String,
      default: null,
    },
    currentAcademicYear: {
      type: String,
      default: () => {
        const y = new Date().getFullYear();
        return `${y}/${y + 1}`;
      },
    },
    bankAccounts: {
      type: [bankAccountSchema],
      default: [],
    },
    tuitionAmount: {
      type: Number,
      default: null,
      min: 0,
    },
    currency: {
      type: String,
      default: 'ETB',
    },
  },
  {
    timestamps: true,
    _id: false,  // we manage _id manually
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

const SchoolInfo = mongoose.model('SchoolInfo', schoolInfoSchema);
export default SchoolInfo;
