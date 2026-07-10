/**
 * Run this once after deployment to ensure all indexes exist.
 * Safe to run multiple times — MongoDB only creates missing indexes.
 * 
 * Usage: node src/scripts/ensureIndexes.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import '../models/User.js';
import '../models/Grade.js';
import '../models/Section.js';
import '../models/Mark.js';
import '../models/StatusLog.js';
import '../models/TeacherAssignment.js';
import '../models/Attendance.js';
import '../models/Event.js';
import '../models/Meeting.js';
import '../models/AuditLog.js';
import '../models/Timetable.js';

// Extra compound indexes for common query patterns
const EXTRA_INDEXES = [
  { model: 'Mark',        fields: { studentId: 1, subject: 1, term: 1 },   opts: {} },
  { model: 'Mark',        fields: { sectionId: 1, subject: 1 },            opts: {} },
  { model: 'StatusLog',   fields: { studentId: 1, createdAt: -1 },         opts: {} },
  { model: 'StatusLog',   fields: { teacherId: 1, createdAt: -1 },         opts: {} },
  { model: 'StatusLog',   fields: { enriched: 1, tone: 1 },                opts: {} },
  { model: 'Attendance',  fields: { studentId: 1, date: -1 },              opts: {} },
  { model: 'Attendance',  fields: { sectionId: 1, date: -1 },              opts: {} },
  { model: 'User',        fields: { role: 1, isActive: 1, lastName: 1 },   opts: {} },
  { model: 'User',        fields: { email: 1 },                             opts: { unique: true } },
  { model: 'Meeting',     fields: { scheduledAt: 1, status: 1 },           opts: {} },
  { model: 'AuditLog',    fields: { actorId: 1, createdAt: -1 },           opts: {} },
];

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  // Sync model schema indexes
  const models = Object.values(mongoose.models);
  for (const Model of models) {
    try {
      await Model.syncIndexes();
      console.log(`📑 ${Model.modelName}: indexes synced`);
    } catch (err) {
      console.error(`❌ ${Model.modelName}: ${err.message}`);
    }
  }

  // Create extra compound indexes
  console.log('\nCreating compound indexes...');
  for (const { model, fields, opts } of EXTRA_INDEXES) {
    try {
      const Model = mongoose.models[model];
      if (!Model) { console.warn(`  ⚠️  Model ${model} not found`); continue; }
      await Model.collection.createIndex(fields, { background: true, ...opts });
      console.log(`  ✅ ${model}: ${JSON.stringify(fields)}`);
    } catch (err) {
      if (err.code === 85 || err.code === 86) {
        console.log(`  ℹ️  ${model}: index already exists`);
      } else {
        console.error(`  ❌ ${model}: ${err.message}`);
      }
    }
  }

  console.log('\n✅ All indexes ensured');
  await mongoose.connection.close();
};

run().catch(err => { console.error(err); process.exit(1); });
