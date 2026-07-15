require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

function dateKey(value) {
    if (!value) return '';
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

function datesBetween(start, end) {
    const dates = [];
    const cursor = new Date(start + 'T00:00:00+05:30');
    const last = new Date(end + 'T00:00:00+05:30');
    while (cursor <= last && dates.length <= 62) {
        dates.push(dateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
}

// Just skipping some helpers for brevity in the test script, 
// I will implement the actual logic in the controller.
