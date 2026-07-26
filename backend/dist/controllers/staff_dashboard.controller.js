"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStaffSummary = void 0;
const staff_controller_1 = require("./staff.controller");
const attendance_dashboard_controller_1 = require("./attendance_dashboard.controller");
const hifz_controller_1 = require("./hifz.controller");
const staff_utils_1 = require("../utils/staff.utils");
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
        const invoke = (handler, request, response) => Promise.resolve()
            .then(() => handler(request, response))
            .catch((error) => {
            console.error('Staff dashboard section failed:', error);
            response.status(500).json({ success: false, error: error?.message || 'Section unavailable' });
        });
        const { mockRes: profileRes, promise: profilePromise } = createMockRes();
        const { mockRes: studentsRes, promise: studentsPromise } = createMockRes();
        const { mockRes: schedulesRes, promise: schedulesPromise } = createMockRes();
        const { mockRes: reportRes, promise: reportPromise } = createMockRes();
        const todayStr = req.query.date || new Date().toISOString().slice(0, 10);
        const reportMonth = todayStr.slice(0, 7);
        const staffId = await (0, staff_utils_1.getStaffId)(req);
        const reqProfile = { ...req, query: { ...req.query } };
        const reqStudents = { ...req, query: { ...req.query, date: todayStr } };
        const reqSchedules = { ...req, query: { ...req.query, date: todayStr } };
        const reqReport = { ...req, query: { ...req.query, month: reportMonth, mentor_id: staffId } };
        const sectionPromises = [
            invoke(staff_controller_1.getMyStaffProfile, reqProfile, profileRes),
            invoke(staff_controller_1.getMyStudentsWithStats, reqStudents, studentsRes),
            invoke(attendance_dashboard_controller_1.getSchedulesForDate, reqSchedules, schedulesRes),
            invoke(hifz_controller_1.calculateBulkMonthlyReport, reqReport, reportRes),
        ];
        const [profileData, studentsData, schedulesData, reportData] = await Promise.all([
            Promise.all([profilePromise, sectionPromises[0]]).then(([data]) => data),
            Promise.all([studentsPromise, sectionPromises[1]]).then(([data]) => data),
            Promise.all([schedulesPromise, sectionPromises[2]]).then(([data]) => data),
            Promise.all([reportPromise, sectionPromises[3]]).then(([data]) => data),
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
