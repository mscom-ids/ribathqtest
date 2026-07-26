import { Request, Response } from 'express';
import { getMyStaffProfile, getMyStudentsWithStats } from './staff.controller';
import { getSchedulesForDate } from './attendance_dashboard.controller';
import { calculateBulkMonthlyReport } from './hifz.controller';
import { getStaffId } from '../utils/staff.utils';

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

        const invoke = (handler: any, request: Request, response: any) =>
            Promise.resolve()
                .then(() => handler(request, response))
                .catch((error: any) => {
                    console.error('Staff dashboard section failed:', error);
                    response.status(500).json({ success: false, error: error?.message || 'Section unavailable' });
                });

        const { mockRes: profileRes, promise: profilePromise } = createMockRes();
        const { mockRes: studentsRes, promise: studentsPromise } = createMockRes();
        const { mockRes: schedulesRes, promise: schedulesPromise } = createMockRes();
        const { mockRes: reportRes, promise: reportPromise } = createMockRes();

        const todayStr = req.query.date as string || new Date().toISOString().slice(0, 10);
        const reportMonth = todayStr.slice(0, 7);
        const staffId = await getStaffId(req);

        const reqProfile = { ...req, query: { ...req.query } } as unknown as Request;
        const reqStudents = { ...req, query: { ...req.query, date: todayStr } } as unknown as Request;
        const reqSchedules = { ...req, query: { ...req.query, date: todayStr } } as unknown as Request;
        const reqReport = { ...req, query: { ...req.query, month: reportMonth, mentor_id: staffId } } as unknown as Request;

        const sectionPromises = [
            invoke(getMyStaffProfile, reqProfile, profileRes),
            invoke(getMyStudentsWithStats, reqStudents, studentsRes),
            invoke(getSchedulesForDate, reqSchedules, schedulesRes),
            invoke(calculateBulkMonthlyReport, reqReport, reportRes),
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
