import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';

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
const app = express();
const PORT = process.env.PORT || 5000;

// ── Core middleware ──
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

app.listen(PORT, () => {
  console.log(`[STARTUP] Server is running on port ${PORT}`);
});
