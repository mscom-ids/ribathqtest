"use strict";
// Dev-only logger. Use for trace/debug noise that helps in development
// but should not appear in production console (PII risk + noise).
// For real errors, keep using `console.error` directly.
Object.defineProperty(exports, "__esModule", { value: true });
exports.devLog = void 0;
const IS_DEV = process.env.NODE_ENV !== 'production';
exports.devLog = IS_DEV
    ? console.log.bind(console)
    : (() => { });
