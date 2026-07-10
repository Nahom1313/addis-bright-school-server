import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    readBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;
