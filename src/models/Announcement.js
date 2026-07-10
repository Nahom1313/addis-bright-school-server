import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema(
  {
    title:     { type: String, required: true, trim: true, maxlength: 150 },
    body:      { type: String, required: true, trim: true, maxlength: 2000 },
    priority:  { type: String, enum: ['normal', 'urgent'], default: 'normal' },
    // Which roles can see this announcement
    targetRoles: [{
      type: String,
      enum: ['teacher', 'student', 'parent', 'registrar', 'director'],
    }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, default: null }, // null = never expires
    isActive:  { type: Boolean, default: true },
  },
  { timestamps: true }
);

announcementSchema.index({ isActive: 1, createdAt: -1 });
announcementSchema.index({ targetRoles: 1, isActive: 1 });

const Announcement = mongoose.model('Announcement', announcementSchema);
export default Announcement;
