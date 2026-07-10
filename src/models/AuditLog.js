import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actorRole: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      // e.g. 'CREATE_USER', 'DEACTIVATE_USER', 'DELETE_GRADE', 'ASSIGN_TEACHER'
    },
    targetModel: {
      type: String,
      default: null,
      // e.g. 'User', 'Grade', 'Section'
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      // Any extra context (e.g. { role: 'teacher', email: '...' })
    },
    ip: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetModel: 1, targetId: 1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
