import mongoose from 'mongoose';

export const ENTRY_TYPES = [
  'term',
  'exam',
  'holiday',
  'break',
  'special',
];

export const TYPE_META = {
  term:    { label: 'Term',         color: '#16a34a', bg: '#dcfce7' },
  exam:    { label: 'Exam',         color: '#dc2626', bg: '#fee2e2' },
  holiday: { label: 'Holiday',      color: '#2563eb', bg: '#dbeafe' },
  break:   { label: 'School Break', color: '#7c3aed', bg: '#ede9fe' },
  special: { label: 'Special Day',  color: '#d97706', bg: '#fef3c7' },
};

const calendarEntrySchema = new mongoose.Schema(
  {
    title:      { type: String, required: true, trim: true, maxlength: 150 },
    type:       { type: String, enum: ENTRY_TYPES, required: true },
    startDate:  { type: Date, required: true },
    endDate:    { type: Date, required: true },
    description:{ type: String, trim: true, maxlength: 500, default: null },
    // For teacher-added exam entries — scoped to their section
    sectionId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Section', default: null },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdByRole: { type: String, enum: ['director', 'teacher'], required: true },
    academicYear:  { type: String, default: () => {
      const y = new Date().getFullYear();
      return `${y}/${y + 1}`;
    }},
  },
  { timestamps: true }
);

calendarEntrySchema.index({ startDate: 1, endDate: 1 });
calendarEntrySchema.index({ type: 1 });
calendarEntrySchema.index({ academicYear: 1 });

const CalendarEntry = mongoose.model('CalendarEntry', calendarEntrySchema);
export default CalendarEntry;
