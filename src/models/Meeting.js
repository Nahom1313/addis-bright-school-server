import mongoose from 'mongoose';

const meetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Meeting title is required'],
      trim: true,
      maxlength: [120, 'Title must be 120 chars or fewer'],
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    // Unique room name used in Jitsi URL
    roomName: {
      type: String,
      required: true,
      unique: true,
    },
    scheduledAt: {
      type: Date,
      required: [true, 'Scheduled time is required'],
    },
    // How long the meeting room is considered "open" (minutes)
    durationMinutes: {
      type: Number,
      default: 60,
      min: 5,
      max: 480,
    },
    scope: {
      type: String,
      enum: ['school', 'section'],
      default: 'school',
    },
    meetingType: {
      type: String,
      enum: ['video', 'audio'],
      default: 'video',
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      default: null,
    },
    gradeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Grade',
      default: null,
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

meetingSchema.virtual('endsAt').get(function () {
  if (!this.scheduledAt) return null;
  return new Date(this.scheduledAt.getTime() + this.durationMinutes * 60 * 1000);
});

meetingSchema.index({ scheduledAt: 1 });
meetingSchema.index({ scope: 1, sectionId: 1 });
meetingSchema.index({ scheduledAt: 1, isActive: 1 }); // fast upcoming meeting queries
meetingSchema.index({ createdBy: 1 });

const Meeting = mongoose.model('Meeting', meetingSchema);
export default Meeting;
