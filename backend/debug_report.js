require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

function dateKey(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const part = (type) => parts.find(item => item.type === type)?.value || '';
    return part('year') + '-' + part('month') + '-' + part('day');
}

function dayOfWeekFromDateKey(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
    return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

function scheduleApplies(schedule, day) {
    if (Number(schedule.day_of_week) !== dayOfWeekFromDateKey(day)) {
        return 'wrong day ' + schedule.day_of_week + ' != ' + dayOfWeekFromDateKey(day);
    }
    const from = dateKey(schedule.effective_from);
    const until = dateKey(schedule.effective_until);
    if (!((!from || from <= day) && (!until || until >= day))) {
        return 'wrong dates from: ' + from + ' until: ' + until + ' day: ' + day;
    }
    return true;
}

async function run() {
    await client.connect();
    
    // Simulate options
    const options = {
        academicYearId: '47fc6ed9-75fa-4c40-965a-8b8243be44cb', // Just guessing or I'll get it from a query
        department: 'hifz',
        standard: '7th',
        division: 'C',
        startDate: '2026-07-01',
        endDate: '2026-07-15'
    };

    // get year id
    const resYear = await client.query(`SELECT id FROM academic_years WHERE is_current = true LIMIT 1`);
    options.academicYearId = resYear.rows[0].id;

    const scheduleSql = "SELECT a.id, a.name, a.class_type, a.standards, a.day_of_week, a.start_time, a.end_time, a.effective_from, a.effective_until, COALESCE(array_agg(DISTINCT asg.group_id) FILTER (WHERE asg.group_id IS NOT NULL), ARRAY[]::uuid[]) AS group_ids FROM attendance_schedules a LEFT JOIN attendance_schedule_groups asg ON asg.schedule_id = a.id WHERE a.academic_year_id = $1 AND (CASE WHEN LOWER(a.class_type) = 'madrassa' THEN 'madrasa' ELSE LOWER(a.class_type) END) = $2 AND a.effective_from <= $4::date AND (a.effective_until IS NULL OR a.effective_until >= $3::date) AND (a.is_deleted = false OR a.is_deleted IS NULL) GROUP BY a.id";
    const schedulesResult = await client.query(scheduleSql, [options.academicYearId, options.department, options.startDate, options.endDate]);
    
    let matchedSchedules = [];
    for (const schedule of schedulesResult.rows) {
        const res = scheduleApplies(schedule, '2026-07-15');
        if (res === true) {
            matchedSchedules.push(schedule);
        } else if (schedule.day_of_week === 3) {
            console.log(schedule.name, 'failed:', res);
        }
    }
    console.log("Schedules that apply on 2026-07-15:", matchedSchedules.length);
    
    await client.end();
}

run().catch(console.error);
