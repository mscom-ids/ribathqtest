"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.warmDatabasePool = warmDatabasePool;
exports.startDatabaseKeepAlive = startDatabaseKeepAlive;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load the root .env.local file used by the web and API development processes.
// Hosted environments continue to use their injected process variables.
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../.env.local') });
const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!postgresUrl) {
    console.error('FATAL ERROR: POSTGRES_URL or DATABASE_URL not found in environment.');
    process.exit(1);
}
const parsedPoolMax = Number(process.env.DB_POOL_MAX || 8);
const parsedPoolMin = Number(process.env.DB_POOL_MIN || 2);
const poolMax = Number.isFinite(parsedPoolMax) && parsedPoolMax > 0 ? Math.floor(parsedPoolMax) : 8;
const poolMin = Number.isFinite(parsedPoolMin) && parsedPoolMin >= 0
    ? Math.min(Math.floor(parsedPoolMin), poolMax)
    : 2;
const parsedPoolWarmConnections = Number(process.env.DB_POOL_WARM_CONNECTIONS || poolMax);
const poolWarmConnections = Number.isFinite(parsedPoolWarmConnections) && parsedPoolWarmConnections >= 0
    ? Math.min(Math.floor(parsedPoolWarmConnections), poolMax)
    : poolMax;
function shouldUseSsl(connectionString) {
    const configured = String(process.env.DB_SSL || '').trim().toLowerCase();
    if (configured)
        return !['0', 'false', 'disable', 'disabled', 'off'].includes(configured);
    try {
        const hostname = new URL(connectionString).hostname.toLowerCase();
        return hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1';
    }
    catch {
        return true;
    }
}
const pool = new pg_1.Pool({
    connectionString: postgresUrl,
    ssl: shouldUseSsl(postgresUrl) ? { rejectUnauthorized: false } : false,
    // A small pool avoids a connection storm against the Supabase pooler.
    max: poolMax,
    // pg-pool's min setting only prevents eviction. warmDatabasePool below
    // eagerly opens these connections before the API starts accepting traffic.
    min: poolMin,
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS || 1800000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 10000),
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 15000),
});
pool.on('error', (err) => {
    console.error('Unexpected error on idle pg client', err);
    // pg-pool removes the failed client. Keep the API process alive so later
    // requests can replace a connection after a transient network interruption.
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
let warmupInFlight = null;
async function openWarmConnections(target) {
    const clients = [];
    const attempts = Array.from({ length: Math.min(Math.max(0, target), poolMax) }, async () => {
        const client = await pool.connect();
        clients.push(client);
        await client.query('SELECT 1');
    });
    const results = await Promise.allSettled(attempts);
    clients.forEach(client => client.release());
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected')
        throw failure.reason;
}
function warmDatabasePool(target = poolWarmConnections) {
    if (target <= 0)
        return Promise.resolve();
    if (warmupInFlight)
        return warmupInFlight;
    const startedAt = Date.now();
    warmupInFlight = openWarmConnections(target)
        .then(() => {
        console.log(`[DB POOL] ${Math.min(target, poolMax)} connections ready in ${Date.now() - startedAt}ms`);
    })
        .finally(() => {
        warmupInFlight = null;
    });
    return warmupInFlight;
}
function startDatabaseKeepAlive() {
    const intervalMs = Number(process.env.DB_KEEPALIVE_INTERVAL_MS || 4 * 60000);
    if (!Number.isFinite(intervalMs) || intervalMs <= 0 || poolWarmConnections <= 0)
        return null;
    const timer = setInterval(() => {
        void warmDatabasePool(poolWarmConnections).catch(error => {
            console.warn('[DB POOL] keep-alive failed:', error?.message || error);
        });
    }, intervalMs);
    timer.unref();
    return timer;
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
    getClient: () => pool.connect(),
    getPoolStats: () => ({
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        min: poolMin,
        warm: poolWarmConnections,
        max: poolMax,
    }),
};
