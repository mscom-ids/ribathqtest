import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import compression from 'compression';
import { devLog } from './utils/logger';

// Load env BEFORE any module that reads process.env
dotenv.config();

// ── Req 9: Startup environment validation ──
const REQUIRED_ENV = ['JWT_SECRET', 'DATABASE_URL'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}
console.log('[STARTUP] Environment validated — all required variables present.');

import authRoutes from './routes/auth.routes';
import studentRoutes from './routes/students.routes';
import leavesRoutes from './routes/leaves.routes';
import financeRoutes from './routes/finance.routes';
import academicsRoutes from './routes/academics.routes';
import staffRoutes from './routes/staff.routes';
import hifzRoutes from './routes/hifz.routes';
import examsRoutes from './routes/exams.routes';
import uploadRoutes from './routes/upload.routes';
import parentRoutes from './routes/parent.routes';
import classesRoutes from './routes/classes.routes';
import attendanceRoutes from './routes/attendance_dashboard.routes';
import eventsRoutes from './routes/events.routes';
import reportsRoutes from './routes/reports.routes';
import chatRoutes from './routes/chat.routes';
import delegationsRoutes from './routes/delegations.routes';
import accessControlRoutes from './routes/access_control.routes';
import academicHistoryRoutes from './routes/academic_history.routes';
import hifzSessionRulesRoutes from './routes/hifz_session_rules.routes';
import yearlyReportRoutes from './routes/yearly_report.routes';
const app = express();
const PORT = process.env.PORT || 5000;

// ── Core middleware ──
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true
}));
app.use(compression());
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  const originalWriteHead = res.writeHead.bind(res);
  (res as any).writeHead = (...args: any[]) => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${durationMs.toFixed(1)}ms`);
    }
    return originalWriteHead.apply(res, args as any);
  };
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    if (durationMs >= 500) {
      devLog(`[SLOW API] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`);
    }
  });
  next();
});
app.use(express.json());
app.use(cookieParser());

// ── Req 7: Rate limit auth routes ──
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  message: { success: false, error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Serve static files for avatars
app.use('/public', express.static(path.join(__dirname, '../public')));

// ── Routes ──
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/leaves', leavesRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/academics', academicsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/hifz', hifzRoutes);
app.use('/api/exams', examsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/delegations', delegationsRoutes);
app.use('/api/access-control', accessControlRoutes);
app.use('/api/academic-history', academicHistoryRoutes);
app.use('/api/hifz-session-rules', hifzSessionRulesRoutes);
app.use('/api/yearly-report', yearlyReportRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

app.listen(PORT, () => {
  console.log(`[STARTUP] Server is running on port ${PORT}`);
});
