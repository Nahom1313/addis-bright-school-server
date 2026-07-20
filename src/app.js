import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import mongoSanitize from 'express-mongo-sanitize';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import { generalLimiter, authLimiter, passwordResetLimiter, uploadLimiter, heavyReadLimiter } from './config/rateLimits.js';

import healthRouter      from './routes/health.js';
import authRouter        from './routes/auth.js';
import gradeRouter       from './routes/grades.js';
import markRouter        from './routes/marks.js';
import sectionRouter     from './routes/sections.js';
import userRouter        from './routes/users.js';
import assignmentRouter  from './routes/assignments.js';
import schoolRouter      from './routes/school.js';
import eventRouter       from './routes/events.js';
import logRouter         from './routes/logs.js';
import attendanceRouter  from './routes/attendance.js';
import meetingRouter     from './routes/meetings.js';
import messageRouter    from './routes/messages.js';
import registrationRouter from './routes/registration.js';
import homeworkRouter    from './routes/homework.js';
import notificationRouter from './routes/notifications.js';
import paymentRouter      from './routes/payments.js';
import sectionReportRouter from './routes/sectionReports.js';
import announcementRouter  from './routes/announcements.js';
import calendarRouter      from './routes/calendar.js';
import transferRouter      from './routes/transfers.js';
import resourceRouter      from './routes/resources.js';
import quizRouter          from './routes/quizzes.js';
import parentSummaryRouter from './routes/parentSummary.js';
import studyHelperRouter   from './routes/studyHelper.js';
import './models/StatusLog.js';
import './models/Timetable.js';
import './models/AuditLog.js';
import './models/Meeting.js';
import './models/Message.js';
import './models/Conversation.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';
const PUBLIC_DIR = join(__dirname, '..', 'public');

const app = express();

// ── Trust proxy (Nginx sits in front in production) ───────────────
if (isProd) app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc:      ["'self'"],
      scriptSrc:       ["'self'", "'unsafe-inline'", 'https://meet.jit.si'],
      styleSrc:        ["'self'", "'unsafe-inline'"],
      imgSrc:          ["'self'", 'data:', 'https:'],
      connectSrc:      ["'self'", 'wss:', 'https:', 'https://meet.jit.si'],
      frameSrc:        ["'self'", 'https://meet.jit.si'],   // allow Jitsi iframe
      frameAncestors:  ["'none'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  } : false,
  crossOriginEmbedderPolicy: false,   // required for Jitsi iframe
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));

// ── CORS ──────────────────────────────────────────────────────────
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map(o => o.trim())
  : (isProd ? [] : ['http://localhost:5173']);

if (isProd && !allowedOrigins.length) {
  console.error('❌ CLIENT_URL must be set in production.');
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (no Origin header), e.g. curl, server-to-server, health checks
    if (!origin) return callback(null, true);
    if (!isProd) return callback(null, true); // permissive in dev
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// ── Compression ───────────────────────────────────────────────────
// Compresses JSON/HTML responses — reduces bandwidth by ~70%
app.use(compression({
  level: 6,                          // balanced speed/ratio
  threshold: 1024,                   // only compress responses >1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

// ── Request parsing ───────────────────────────────────────────────
// 10kb was too small for legitimate bulk operations — a 200-row student
// bulk import, or a full class's attendance/grades in one submission,
// comfortably exceeds it and was being rejected with a raw 413.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
// Prevent NoSQL injection attacks
app.use(mongoSanitize());

// ── Logging ───────────────────────────────────────────────────────
if (isProd) {
  // Skip health check logs to reduce noise
  app.use(morgan('combined', { skip: (req) => req.path === '/api/health' }));
} else {
  app.use(morgan('dev'));
}

// ── Routes with tiered rate limiting ─────────────────────────────
// Serve uploaded profile pictures
app.use('/uploads', express.static('uploads', {
  maxAge: '30d',
  setHeaders: (res) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));

app.use('/api/health',      healthRouter);

// Auth — strict limits on login, register, password reset
app.use('/api/auth/login',           authLimiter);
app.use('/api/auth/register',        authLimiter);
app.use('/api/auth/forgot-password', passwordResetLimiter);
app.use('/api/auth/reset-password',  passwordResetLimiter);
app.use('/api/auth',                 authRouter);

// Bulk import — strict upload limit
app.use('/api/users/bulk',           uploadLimiter);

// Heavy reads — analytics, logs (cached but still rate-limited)
app.use('/api/logs',                 heavyReadLimiter, logRouter);

// General API — applies to everything else
app.use('/api', generalLimiter);

app.use('/api/grades',      gradeRouter);
app.use('/api/marks',       markRouter);
app.use('/api/sections',    sectionRouter);
app.use('/api/users',       userRouter);
app.use('/api/assignments', assignmentRouter);
app.use('/api/school',      schoolRouter);
app.use('/api/events',      eventRouter);
app.use('/api/attendance',  attendanceRouter);
app.use('/api/meetings',    meetingRouter);
app.use('/api/registration', registrationRouter);
app.use('/api/messages',     messageRouter);
app.use('/api/homework',       homeworkRouter);
app.use('/api/notifications',  notificationRouter);
app.use('/api/payments',        paymentRouter);
app.use('/api/section-reports', sectionReportRouter);
app.use('/api/announcements',   announcementRouter);
app.use('/api/calendar',        calendarRouter);
app.use('/api/transfers',       transferRouter);
app.use('/api/resources',       resourceRouter);
app.use('/api/quizzes',         quizRouter);
app.use('/api/parent-summary',  parentSummaryRouter);
app.use('/api/study-helper',    studyHelperRouter);

// ── Static files + SPA fallback ───────────────────────────────────
if (isProd && existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR, {
    maxAge:  '7d',              // cache static assets 7 days
    etag:    true,
    index:   false,             // don't auto-serve index.html (we do it below)
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(join(PUBLIC_DIR, 'index.html'));
  });
} else {
  app.use(notFound);
}

app.use(errorHandler);

export default app;
