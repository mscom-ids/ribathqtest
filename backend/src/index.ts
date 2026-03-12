import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve static files for avatars
app.use('/public', express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/leaves', leavesRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/academics', academicsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/hifz', hifzRoutes);
app.use('/api/exams', examsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/parent', parentRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
