const fs = require('fs');

const path = 'd:\\NewRQP\\backend\\src\\controllers\\management-reports.controller.ts';
let content = fs.readFileSync(path, 'utf8');

const regex = /export const getManagementAttendanceReport = async \(req: Request, res: Response\) => \{[\s\S]*?\n\};/;

const newFunc = `export const getManagementAttendanceReport = async (req: Request, res: Response) => {
    try {
        const options = await resolveOptions(req);
        const result = await cachedResult(makeCacheKey('reports:management-attendance:v3', cacheParts(options)), 120000, async () => {
            const scheduleSql = "SELECT a.id, a.name, a.class_type, a.standards, a.day_of_week, a.start_time, a.end_time, a.effective_from, a.effective_until, COALESCE(array_agg(DISTINCT asg.group_id) FILTER (WHERE asg.group_id IS NOT NULL), ARRAY[]::uuid[]) AS group_ids FROM attendance_schedules a LEFT JOIN attendance_schedule_groups asg ON asg.schedule_id = a.id WHERE a.academic_year_id = $1 AND (CASE WHEN LOWER(a.class_type) = 'madrassa' THEN 'madrasa' ELSE LOWER(a.class_type) END) = $2 AND a.effective_from <= $4::date AND (a.effective_until IS NULL OR a.effective_until >= $3::date) AND (a.is_deleted = false OR a.is_deleted IS NULL) GROUP BY a.id";
            const [filters, rosterResult, schedulesResult, cancellationsResult, leavesResult, classMarksResult, studentLeavesResult] = await Promise.all([
                loadFilters(options.academicYearId),
                loadRoster(options),
                db.query(scheduleSql, [options.academicYearId, options.department, options.startDate, options.endDate]),
                db.query('SELECT schedule_id, date, cancelled_standards FROM attendance_cancellations WHERE date BETWEEN $1::date AND $2::date', [options.startDate, options.endDate]),
                db.query('SELECT start_datetime, end_datetime, target_classes, is_entire_institution FROM institutional_leaves WHERE start_datetime < ($2::date + 1) AND end_datetime >= $1::date', [options.startDate, options.endDate]),
                db.query('SELECT schedule_id, date FROM attendance_marks WHERE date BETWEEN $1::date AND $2::date', [options.startDate, options.endDate]),
                db.query(\`SELECT student_id, start_datetime, COALESCE(actual_return_datetime, end_datetime, 'infinity'::timestamptz) as effective_end_datetime 
                          FROM student_leaves 
                          WHERE status = 'outside' AND start_datetime < ($2::date + 1) AND COALESCE(actual_return_datetime, end_datetime, 'infinity'::timestamptz) >= $1::date\`, [options.startDate, options.endDate]),
            ]);
            const students = rosterResult.rows;
            const marksResult = students.length
                ? await db.query('SELECT student_id, schedule_id, date, status FROM student_attendance_marks WHERE date BETWEEN $1::date AND $2::date AND student_id = ANY($3::text[])', [options.startDate, options.endDate, students.map((student: any) => student.adm_no)])
                : { rows: [] as any[] };
            const marks = new Map(marksResult.rows.map((row: any) => [row.student_id + '|' + row.schedule_id + '|' + dateKey(row.date), row]));
            const cancellations = new Map(cancellationsResult.rows.map((row: any) => [row.schedule_id + '|' + dateKey(row.date), row]));
            const classMarks = new Set(classMarksResult.rows.map((row: any) => row.schedule_id + '|' + dateKey(row.date)));
            const dates = datesBetween(options.startDate, options.endDate);
            
            const outsideLeaves = studentLeavesResult.rows;
            function wasOutside(studentId: string, day: string) {
                return outsideLeaves.some((l: any) => l.student_id === studentId && dateKey(l.start_datetime) <= day && dateKey(l.effective_end_datetime) >= day);
            }

            const scopedGroups = filters.groups.filter((group: any) =>
                normalizeDepartment(group.department) === options.department
                && (!options.standard || normalizeStandard(group.standard) === normalizeStandard(options.standard))
                && (!options.division || String(group.division || '') === options.division)
            );
            const scopedStandards = [...new Set(scopedGroups.map((group: any) => normalizeStandard(group.standard)).filter(Boolean))] as string[];
            if (!scopedStandards.length && options.standard) scopedStandards.push(normalizeStandard(options.standard));

            // Group by schedule
            const schedulesData = [];
            
            for (const schedule of schedulesResult.rows) {
                const applicableStandards = scheduleStandardsForScope(schedule, scopedGroups, scopedStandards);
                if (!applicableStandards.length) continue;
                
                const summary = { total_classes: 0, completed: 0, pending: 0, cancelled: 0, present: 0, absent: 0, leave: 0 };
                const scheduleDates = dates.filter(day => scheduleApplies(schedule, day));
                
                if (!scheduleDates.length) continue;
                
                for (const day of scheduleDates) {
                    summary.total_classes += 1;
                    const cancellation = cancellations.get(schedule.id + '|' + day);
                    const fullyCancelled = applicableStandards.every(standard =>
                        cancellationApplies(cancellation, standard)
                        || leavesResult.rows.some((leave: any) => leaveApplies(leave, schedule, day, standard))
                    );
                    if (fullyCancelled) summary.cancelled += 1;
                    else if (classMarks.has(schedule.id + '|' + day)) summary.completed += 1;
                    else summary.pending += 1;
                }
                
                const rows = students.filter((student: any) => studentMatchesSchedule(student, schedule)).map((student: any) => {
                    const totals = { present: 0, absent: 0, leave: 0, pending: 0, cancelled: 0, total: 0 };
                    const cells: Record<string, string> = {};
                    
                    for (const day of scheduleDates) {
                        const cancelled = cancellationApplies(cancellations.get(schedule.id + '|' + day), student.standard)
                            || leavesResult.rows.some((leave: any) => leaveApplies(leave, schedule, day, student.standard));
                        if (cancelled) {
                            cells[day] = 'C';
                            totals.cancelled += 1;
                            continue;
                        }
                        
                        let code = statusCode(marks.get(student.adm_no + '|' + schedule.id + '|' + day)?.status);
                        
                        // If no mark was submitted, check if student was OUTSIDE on this day
                        if (code === 'N' && wasOutside(student.adm_no, day)) {
                            code = 'A';
                        }
                        
                        cells[day] = code;
                        totals.total += 1;
                        if (code === 'N') totals.pending += 1;
                        if (code === 'P') { totals.present += 1; summary.present += 1; }
                        if (code === 'A') { totals.absent += 1; summary.absent += 1; }
                        if (code === 'L') { totals.leave += 1; summary.leave += 1; }
                    }
                    const denominator = totals.present + totals.absent;
                    return {
                        adm_no: student.adm_no, name: student.name, photo_url: student.photo_url,
                        standard: student.standard, division: student.division, cells, ...totals,
                        percentage: denominator ? Math.round(totals.present / denominator * 1000) / 10 : 0,
                    };
                });
                
                schedulesData.push({
                    id: schedule.id,
                    name: schedule.name,
                    summary,
                    data: rows
                });
            }

            return {
                academic_year: options.year,
                period: { start_date: options.startDate, end_date: options.endDate },
                filters, dates, pagination: pageInfo(students, options), schedules: schedulesData,
            };
        });
        return res.json({ success: true, ...result });
    } catch (error: any) {
        const message = error?.message || 'Failed to generate attendance report.';
        return res.status(message.includes('required') || message.includes('exceed') ? 400 : 500).json({ success: false, error: message });
    }
};`;

content = content.replace(regex, newFunc);
fs.writeFileSync(path, content, 'utf8');
console.log('Done');
