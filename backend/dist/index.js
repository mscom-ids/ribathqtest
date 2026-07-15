"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = __importDefault(require("path"));
const compression_1 = __importDefault(require("compression"));
const db_1 = require("./config/db");
// Load env BEFORE any module that reads process.env
dotenv_1.default.config();
// â”€â”€ Req 9: Startup environment validation â”€â”€
const REQUIRED_ENV = ['JWT_SECRET', 'DATABASE_URL'];
for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
        console.error(`FATAL: Missing required environment variable: ${key}`);
        process.exit(1);
    }
}
console.log('[STARTUP] Environment validated â€” all required variables present.');
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
const access_control_routes_1 = __importDefault(require("./routes/access_control.routes"));
const academic_history_routes_1 = __importDefault(require("./routes/academic_history.routes"));
const academic_placement_routes_1 = __importDefault(require("./routes/academic-placement.routes"));
const yearly_report_routes_1 = __importDefault(require("./routes/yearly_report.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
const parsedSlowApiThreshold = Number(process.env.SLOW_API_THRESHOLD_MS || 500);
const SLOW_API_THRESHOLD_MS = Number.isFinite(parsedSlowApiThreshold) && parsedSlowApiThreshold > 0
    ? parsedSlowApiThreshold
    : 500;
// â”€â”€ Core middleware â”€â”€
const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin))
            return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true
}));
app.use((0, compression_1.default)());
app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    const requestPath = req.originalUrl.split('?')[0] || req.path;
    const originalWriteHead = res.writeHead.bind(res);
    res.writeHead = (...args) => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1000000;
        if (!res.headersSent) {
            res.setHeader('X-Response-Time', `${durationMs.toFixed(1)}ms`);
        }
        return originalWriteHead.apply(res, args);
    };
    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1000000;
        if (durationMs >= SLOW_API_THRESHOLD_MS) {
            console.warn(`[SLOW API] ${req.method} ${requestPath} ${res.statusCode} ${durationMs.toFixed(1)}ms`);
        }
    });
    next();
});
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// Login rate limiting is applied inside auth.routes.ts.
// Serve static files for avatars
app.use('/public', express_1.default.static(path_1.default.join(__dirname, '../public')));
// â”€â”€ Routes â”€â”€
app.use('/api/auth', auth_routes_1.default);
app.use('/api/students', students_routes_1.default);
app.use('/api/leaves', leaves_routes_1.default);
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
app.use('/api/access-control', access_control_routes_1.default);
app.use('/api/academic-history', academic_history_routes_1.default);
app.use('/api/academic-placements', academic_placement_routes_1.default);
app.use('/api/yearly-report', yearly_report_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'Backend is running', database_pool: db_1.db.getPoolStats() });
});
async function startServer() {
    try {
        await (0, db_1.warmDatabasePool)();
    }
    catch (error) {
        // Keep the API available during a temporary database outage. The normal
        // read retry path will reconnect when the database becomes reachable.
        console.warn('[STARTUP] Database pool warm-up failed:', error?.message || error);
    }
    app.listen(PORT, () => {
        (0, db_1.startDatabaseKeepAlive)();
        console.log(`[STARTUP] Server is running on port ${PORT}`);
    });
}
void startServer();
