import mongoose from 'mongoose';

const DAYS    = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const PERIODS = ['Period 1','Period 2','Period 3','Period 4','Period 5','Period 6','Period 7','Period 8'];

const timetableSlotSchema = new mongoose.Schema({
  day:       { type: String, enum: DAYS,    required: true },
  period:    { type: String, enum: PERIODS, required: true },
  subject:   { type: String, trim: true, maxlength: 100, required: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
  room:      { type: String, trim: true, default: null },
}, { _id: true });

const timetableSchema = new mongoose.Schema(
  {
    teacherId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    academicYear: {
      type: String, trim: true,
      default: () => { const y = new Date().getFullYear(); return `${y}/${y+1}`; },
    },
    slots: [timetableSlotSchema],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);



export const TIMETABLE_DAYS    = DAYS;
export const TIMETABLE_PERIODS = PERIODS;
const Timetable = mongoose.model('Timetable', timetableSchema);
export default Timetable;
