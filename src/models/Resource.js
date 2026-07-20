import mongoose from 'mongoose';

const resourceSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
      maxlength: [100, 'Subject must be 100 chars or fewer'],
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [150, 'Title must be 150 chars or fewer'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description must be 1000 chars or fewer'],
      default: null,
    },
    // 'file'  -> uploaded to Cloudinary, fileUrl is set
    // 'link'  -> external URL (site, Drive folder, etc.), externalUrl is set
    // 'video' -> external video URL (YouTube etc.), externalUrl is set
    type: {
      type: String,
      enum: ['file', 'link', 'video'],
      required: true,
    },
    fileUrl: {
      type: String,
      trim: true,
      default: null,
    },
    fileName: {
      type: String,
      trim: true,
      default: null,
    },
    // Text extracted from PDF uploads, used to ground the AI study-helper
    // chat in the actual material rather than letting it guess. Capped at
    // ~6000 chars to keep chat prompts a reasonable size. null for
    // non-PDF files, links, and videos.
    extractedText: {
      type: String,
      default: null,
    },
    externalUrl: {
      type: String,
      trim: true,
      default: null,
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

resourceSchema.index({ subject: 1, createdAt: -1 });
resourceSchema.index({ teacherId: 1, createdAt: -1 });

// A file resource needs fileUrl; a link/video resource needs externalUrl
resourceSchema.pre('validate', function (next) {
  if (this.type === 'file' && !this.fileUrl) {
    return next(new Error('A file resource requires an uploaded file.'));
  }
  if ((this.type === 'link' || this.type === 'video') && !this.externalUrl) {
    return next(new Error('A link/video resource requires a URL.'));
  }
  next();
});

const Resource = mongoose.model('Resource', resourceSchema);
export default Resource;
