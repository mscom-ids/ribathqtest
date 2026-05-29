"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load the root .env.local file which contains the standard NEXT_PUBLIC_SUPABASE_URL
// For production, this will be set via Render/DigitalOcean env variables
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../.env.local') });
// In your .env.local, we assume you add a standard POSTGRES_URL string.
// If you only have NEXT_PUBLIC_SUPABASE_URL, you must construct the Postgres string
// or manually define POSTGRES_URL.
const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!postgresUrl) {
    console.error("FATAL ERROR: POSTGRES_URL or DATABASE_URL not found in environment.");
    process.exit(1);
}
const pool = new pg_1.Pool({
    connectionString: postgresUrl,
    // If connecting to external Supabase from localhost, SSL is required
    ssl: {
        rejectUnauthorized: false
    },
    // Render instances talking to Supabase pooler should avoid opening too many
    // database connections at once. A smaller pool plus short app-level caching
    // is usually faster than stampeding the pooler under page-load bursts.
    max: Number(process.env.DB_POOL_MAX || 8),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 10000),
    // Prevent any single query from running longer than 15s.
    // Without this, a slow query can hold a connection indefinitely,
    // eventually exhausting the pool and blocking ALL requests.
    statement_timeout: 15000,
});
pool.on('error', (err) => {
    console.error('Unexpected error on idle pg client', err);
    // The failed idle client has already been removed by pg-pool. Exiting here
    // makes transient Supabase pooler/network hiccups look like frontend
    // "Network Error" crashes, so keep the API process alive for new requests.
});
const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS || 250);
const READ_RETRY_ATTEMPTS = Number(process.env.DB_READ_RETRY_ATTEMPTS || 2);
function summarizeSql(text) {
    return text.replace(/\s+/g, ' ').trim().slice(0, 220);
}
function isReadOnlySql(text) {
    const sql = text.trim().toLowerCase();
    return sql.startsWith('select') || sql.startsWith('with');
}
function isTransientConnectionError(error) {
    const message = String(error?.message || '').toLowerCase();
    return (message.includes('connection terminated') ||
        message.includes('connection timeout') ||
        message.includes('timeout exceeded') ||
        message.includes('connection ended unexpectedly') ||
        error?.code === 'ECONNRESET' ||
        error?.code === 'ETIMEDOUT' ||
        error?.code === '57P01');
}
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
exports.db = {
    query: async (text, params) => {
        const startedAt = Date.now();
        try {
            const maxAttempts = isReadOnlySql(text) ? Math.max(1, READ_RETRY_ATTEMPTS) : 1;
            let lastError;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    return await pool.query(text, params);
                }
                catch (error) {
                    lastError = error;
                    if (attempt >= maxAttempts || !isTransientConnectionError(error))
                        throw error;
                    const delayMs = 120 * attempt;
                    console.warn(`[DB RETRY] read query attempt ${attempt + 1}/${maxAttempts} after transient error: ${error.message}`);
                    await wait(delayMs);
                }
            }
            throw lastError;
        }
        finally {
            const duration = Date.now() - startedAt;
            if (duration >= SLOW_QUERY_MS) {
                console.warn(`[SLOW DB] ${duration}ms params=${params?.length || 0} sql="${summarizeSql(text)}"`);
            }
        }
    },
    getClient: () => {
        return pool.connect();
    }
};
