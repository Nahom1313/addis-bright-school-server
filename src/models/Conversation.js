import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    // Exactly 2 participants: one parent, one teacher
    participants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    }],
    // Student context (optional — "regarding Yonas")
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastMessage: {
      type: String,
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    lastMessageBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Unread count per participant
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// One conversation per parent-teacher pair (regarding a specific student)
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
