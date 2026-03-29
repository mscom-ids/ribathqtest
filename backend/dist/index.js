"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
// Load env BEFORE any module that reads process.env
dotenv_1.default.config();
// ── Req 9: Startup environment validation ──
const REQUIRED_ENV = ['JWT_SECRET', 'DATABASE_URL'];
for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
        console.error(`FATAL: Missing required environment variable: ${key}`);
        process.exit(1);
    }
}
console.log('[STARTUP] Environment validated — all required variables present.');
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const students_routes_1 = __importDefault(require("./routes/students.routes"));
const leaves_routes_1 = __importDefault(require("./routes/leaves.routes"));
const finance_routes_1 = __importDefault(require("./routes/finance.routes"));
const academics_routes_1 = __importDefault(require("./routes/academics.routes"));
const staff_routes_1 = __importDefault(require("./routes/staff.routes"));
const hifz_routes_1 = __importDefault(require("./routes/hifz.routes"));
const exams_routes_1 = __importDefault(require("./routes/exams.routes"));
const upload_routes_1 = __importDefault(require("./routes/upload.routes"));
const parent_routes_1 = __importDefault(require("./routes/parent.routes"));
const classes_routes_1 = __importDefault(require("./routes/classes.routes"));
const attendance_dashboard_routes_1 = __importDefault(require("./routes/attendance_dashboard.routes"));
const events_routes_1 = __importDefault(require("./routes/events.routes"));
const reports_routes_1 = __importDefault(require("./routes/reports.routes"));
const chat_routes_1 = __importDefault(require("./routes/chat.routes"));
const delegations_routes_1 = __importDefault(require("./routes/delegations.routes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// ── Core middleware ──
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// ── Req 7: Rate limit auth routes ──
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts per window
    message: { success: false, error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});
// Serve static files for avatars
app.use('/public', express_1.default.static(path_1.default.join(__dirname, '../public')));
// ── Routes ──
app.use('/api/auth', authLimiter, auth_routes_1.default);
app.use('/api/students', students_routes_1.default);
app.use('/api/leaves', leaves_routes_1.default);
app.use('/api/finance', finance_routes_1.default);
app.use('/api/academics', academics_routes_1.default);
app.use('/api/staff', staff_routes_1.default);
app.use('/api/hifz', hifz_routes_1.default);
app.use('/api/exams', exams_routes_1.default);
app.use('/api/upload', upload_routes_1.default);
app.use('/api/parent', parent_routes_1.default);
app.use('/api/classes', classes_routes_1.default);
app.use('/api/attendance', attendance_dashboard_routes_1.default);
app.use('/api/events', events_routes_1.default);
app.use('/api/reports', reports_routes_1.default);
app.use('/api/chat', chat_routes_1.default);
app.use('/api/delegations', delegations_routes_1.default);
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend is running' });
});
app.listen(PORT, () => {
    console.log(`[STARTUP] Server is running on port ${PORT}`);
});
