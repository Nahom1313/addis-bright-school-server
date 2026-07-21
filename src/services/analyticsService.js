import User from '../models/User.js';
import Section from '../models/Section.js';
import Attendance from '../models/Attendance.js';
import StatusLog from '../models/StatusLog.js';
import Mark from '../models/Mark.js';

export const getAnalyticsOverview = async () => {
  const now   = new Date();
  const day30 = new Date(now); day30.setDate(day30.getDate() - 30);
  const day7  = new Date(now); day7.setDate(day7.getDate() - 7);

  const [
    totalStudents, totalTeachers, totalParents,
    newStudents7,
    attendanceStats, logStats, markStats,
    logsByTone, logsByCategory,
  ] = await Promise.all([
    User.countDocuments({ role: 'student', isActive: true }),
    User.countDocuments({ role: 'teacher', isActive: true }),
    User.countDocuments({ role: 'parent',  isActive: true }),
    User.countDocuments({ role: 'student', isActive: true, createdAt: { $gte: day7 } }),

    Attendance.aggregate([
      { $match: { date: { $gte: day30 } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    StatusLog.aggregate([
      { $match: { createdAt: { $gte: day30 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),

    Mark.aggregate([
      { $group: { _id: '$subject', avg: { $avg: { $multiply: [{ $divide: ['$score', '$maxScore'] }, 100] } }, count: { $sum: 1 } } },
      { $sort: { avg: -1 } },
      { $limit: 8 },
    ]),

    StatusLog.aggregate([
      { $match: { enriched: true } },
      { $group: { _id: '$tone', count: { $sum: 1 } } },
    ]),

    StatusLog.aggregate([
      { $match: { enriched: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const attMap = attendanceStats.reduce((m, a) => { m[a._id] = a.count; return m; }, {});
  const totalAtt = Object.values(attMap).reduce((s, v) => s + v, 0);

  return {
    totals: { students: totalStudents, teachers: totalTeachers, parents: totalParents, newStudents7 },
    attendance: {
      present: attMap.present || 0,
      absent:  attMap.absent  || 0,
      late:    attMap.late    || 0,
      excused: attMap.excused || 0,
      total:   totalAtt,
      rate:    totalAtt > 0 ? Math.round(((attMap.present || 0) / totalAtt) * 100) : null,
    },
    logActivity: logStats.map(l => ({ date: l._id, count: l.count })),
    marksBySubject: markStats.map(m => ({ subject: m._id, avg: Math.round(m.avg), count: m.count })),
    logsByTone:     logsByTone.map(l => ({ tone: l._id, count: l.count })),
    logsByCategory: logsByCategory.map(l => ({ category: l._id, count: l.count })),
  };
};

// Per-section breakdown — used for the AI insights so it can call out a
// specific section by name ("Grade 9B attendance is down") rather than
// only speaking in school-wide averages.
export const getSectionBreakdown = async () => {
  const sections = await Section.find({ isActive: true }).select('name gradeId').populate('gradeId', 'name');

  const day30 = new Date(); day30.setDate(day30.getDate() - 30);

  const results = await Promise.all(sections.map(async (sec) => {
    const [attendanceStats, marksStats] = await Promise.all([
      Attendance.aggregate([
        { $match: { sectionId: sec._id, date: { $gte: day30 } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Mark.aggregate([
        { $match: { sectionId: sec._id } },
        { $group: { _id: null, avg: { $avg: { $multiply: [{ $divide: ['$score', '$maxScore'] }, 100] } } } },
      ]),
    ]);

    const attMap = attendanceStats.reduce((m, a) => { m[a._id] = a.count; return m; }, {});
    const total = Object.values(attMap).reduce((s, v) => s + v, 0);

    return {
      section: `${sec.gradeId?.name || ''} ${sec.name}`.trim(),
      attendanceRate: total > 0 ? Math.round(((attMap.present || 0) / total) * 100) : null,
      avgMark: marksStats[0]?.avg ? Math.round(marksStats[0].avg) : null,
    };
  }));

  return results.filter(r => r.attendanceRate !== null || r.avgMark !== null);
};
