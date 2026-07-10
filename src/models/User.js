import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const ROLES = ['director', 'teacher', 'parent', 'student', 'registrar'];

const userSchema = new mongoose.Schema(
  {
    firstName:  { type: String, required: true, trim: true, maxlength: 50 },
    lastName:   { type: String, required: true, trim: true, maxlength: 50 },
    email:      { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email'] },
    password:   { type: String, required: true, minlength: 8, select: false },
    role:       { type: String, enum: { values: ROLES, message: 'Invalid role' }, required: true },
    isActive:   { type: Boolean, default: true },

    // ─── Extended registration fields ─────────────────────────
    phone:          { type: String, trim: true, default: null },
    familyPhone:    { type: String, trim: true, default: null },  // if student has no phone
    dateOfBirth:    { type: Date,   default: null },
    address:        { type: String, trim: true, maxlength: 200, default: null },
    profilePicture: { type: String, default: null },  // filename stored in /uploads

    // ─── Student only ─────────────────────────────────────────
    studentIds:  { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: undefined },
    sectionId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Section', default: null },
    studentCode: { type: String, sparse: true, unique: true, default: undefined },

    // ─── Auth ────────────────────────────────────────────────
    emailVerified:       { type: Boolean, default: false },
    emailVerifyToken:    { type: String, select: false, default: null },
    emailVerifyExpires:  { type: Date,   select: false, default: null },
    passwordResetToken:  { type: String, select: false, default: null },
    passwordResetExpires:{ type: Date,   select: false, default: null },
    lastLoginAt:         { type: Date,   default: null },
    // Firebase FCM tokens for push notifications (one per device)
    fcmTokens: { type: [String], default: [], select: false },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual: age computed from dateOfBirth
userSchema.virtual('age').get(function () {
  if (!this.dateOfBirth) return null;
  const diff = Date.now() - new Date(this.dateOfBirth).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  delete obj.emailVerifyToken;
  delete obj.emailVerifyExpires;
  delete obj.__v;
  return obj;
};

userSchema.methods.createPasswordResetToken = function () {
  const raw = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken   = crypto.createHash('sha256').update(raw).digest('hex');
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000;
  return raw;
};

userSchema.methods.createEmailVerifyToken = function () {
  const raw = crypto.randomBytes(32).toString('hex');
  this.emailVerifyToken   = crypto.createHash('sha256').update(raw).digest('hex');
  this.emailVerifyExpires = Date.now() + 24 * 60 * 60 * 1000;
  return raw;
};

userSchema.index({ role: 1 });
userSchema.index({ sectionId: 1 });
userSchema.index({ studentIds: 1 });

const User = mongoose.model('User', userSchema);
export default User;
