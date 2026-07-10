import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      required: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'excused'],
      required: true,
      default: 'present',
    },
    note: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// One attendance record per student per day per section
attendanceSchema.index({ studentId: 1, sectionId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ sectionId: 1, date: -1 });
attendanceSchema.index({ teacherId: 1, date: -1 });

const Attendance = mongoose.model('Attendance', attendanceSchema);
export default Attendance;
