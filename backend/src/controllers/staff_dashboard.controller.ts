import { Request, Response } from 'express';
import { getMyStaffProfile, getMyStudentsWithStats } from './staff.controller';
import { getSchedulesForDate } from './attendance_dashboard.controller';
import { calculateMonthlyReportData } from './hifz.controller';

export const getStaffSummary = async (req: Request, res: Response) => {
    try {
        const createMockRes = () => {
            let resolveData: (value: any) => void;
            let rejectData: (reason: any) => void;
            const promise = new Promise((resolve, reject) => {
                resolveData = resolve;
                rejectData = reject;
            });
            const mockRes: any = {
                status: (code: number) => mockRes,
                json: (data: any) => resolveData(data),
                send: (data: any) => resolveData(data),
            };
            return { mockRes, promise };
        };

        const { mockRes: profileRes, promise: profilePromise } = createMockRes();
        const { mockRes: studentsRes, promise: studentsPromise } = createMockRes();
        const { mockRes: schedulesRes, promise: schedulesPromise } = createMockRes();
        const { mockRes: reportRes, promise: reportPromise } = createMockRes();

        const todayStr = req.query.date as string || new Date().toISOString().slice(0, 10);
        const reportMonth = todayStr.slice(0, 7);
        const staffId = (req as any).user?.staffId || (req as any).user?.id || (req as any).user?.userId;

        const reqProfile = { ...req, query: { ...req.query } } as unknown as Request;
        const reqStudents = { ...req, query: { ...req.query, date: todayStr } } as unknown as Request;
        const reqSchedules = { ...req, query: { ...req.query, date: todayStr } } as unknown as Request;
        const reqReport = { ...req, query: { ...req.query, month: reportMonth, mentor_id: staffId } } as unknown as Request;

        getMyStaffProfile(reqProfile, profileRes);
        getMyStudentsWithStats(reqStudents, studentsRes);
        getSchedulesForDate(reqSchedules, schedulesRes);
        calculateMonthlyReportData(reqReport, reportRes);

        const [profileData, studentsData, schedulesData, reportData] = await Promise.all([
            profilePromise, studentsPromise, schedulesPromise, reportPromise
        ]);

        res.json({
            success: true,
            summary: {
                profile: (profileData as any).staff || (profileData as any).data || profileData,
                students: (studentsData as any).students || [],
                schedules: (schedulesData as any).data || (schedulesData as any).schedules || [],
                monthly_report: (reportData as any).reports || []
            }
        });
    } catch (err) {
        console.error('Error fetching staff summary:', err);
        res.status(500).json({ success: false, error: 'Failed to aggregate staff summary' });
    }
};
