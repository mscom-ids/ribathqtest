require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

function dayOfWeekFromDateKey(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
    return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

async function run() {
    console.log("Day of week for 2026-07-15 is:", dayOfWeekFromDateKey('2026-07-15'));
}
run();
