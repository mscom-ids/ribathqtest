"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStaffSummary = void 0;
const staff_controller_1 = require("./staff.controller");
const attendance_dashboard_controller_1 = require("./attendance_dashboard.controller");
const hifz_controller_1 = require("./hifz.controller");
const getStaffSummary = async (req, res) => {
    try {
        const createMockRes = () => {
            let resolveData;
            let rejectData;
            const promise = new Promise((resolve, reject) => {
                resolveData = resolve;
                rejectData = reject;
            });
            const mockRes = {
                status: (code) => mockRes,
                json: (data) => resolveData(data),
                send: (data) => resolveData(data),
            };
            return { mockRes, promise };
        };
        const { mockRes: profileRes, promise: profilePromise } = createMockRes();
        const { mockRes: studentsRes, promise: studentsPromise } = createMockRes();
        const { mockRes: schedulesRes, promise: schedulesPromise } = createMockRes();
        const { mockRes: reportRes, promise: reportPromise } = createMockRes();
        const todayStr = req.query.date || new Date().toISOString().slice(0, 10);
        const reportMonth = todayStr.slice(0, 7);
        const staffId = req.user?.staffId || req.user?.id || req.user?.userId;
        const reqProfile = { ...req, query: { ...req.query } };
        const reqStudents = { ...req, query: { ...req.query, date: todayStr } };
        const reqSchedules = { ...req, query: { ...req.query, date: todayStr } };
        const reqReport = { ...req, query: { ...req.query, month: reportMonth, mentor_id: staffId } };
        (0, staff_controller_1.getMyStaffProfile)(reqProfile, profileRes);
        (0, staff_controller_1.getMyStudentsWithStats)(reqStudents, studentsRes);
        (0, attendance_dashboard_controller_1.getSchedulesForDate)(reqSchedules, schedulesRes);
        (0, hifz_controller_1.calculateMonthlyReportData)(reqReport, reportRes);
        const [profileData, studentsData, schedulesData, reportData] = await Promise.all([
            profilePromise, studentsPromise, schedulesPromise, reportPromise
        ]);
        res.json({
            success: true,
            summary: {
                profile: profileData.staff || profileData.data || profileData,
                students: studentsData.students || [],
                schedules: schedulesData.data || schedulesData.schedules || [],
                monthly_report: reportData.reports || []
            }
        });
    }
    catch (err) {
        console.error('Error fetching staff summary:', err);
        res.status(500).json({ success: false, error: 'Failed to aggregate staff summary' });
    }
};
exports.getStaffSummary = getStaffSummary;
