import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type:    { type: String, required: true }, // e.g. 'homework', 'meeting', 'log', 'event'
    title:   { type: String, required: true, maxlength: 120 },
    body:    { type: String, required: true, maxlength: 300 },
    link:    { type: String, default: null }, // frontend route to navigate to on tap
    read:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
