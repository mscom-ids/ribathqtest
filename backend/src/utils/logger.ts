// Dev-only logger. Use for trace/debug noise that helps in development
// but should not appear in production console (PII risk + noise).
// For real errors, keep using `console.error` directly.

const IS_DEV = process.env.NODE_ENV !== 'production';

export const devLog = IS_DEV
    ? console.log.bind(console)
    : (() => { /* no-op in prod */ }) as typeof console.log;
