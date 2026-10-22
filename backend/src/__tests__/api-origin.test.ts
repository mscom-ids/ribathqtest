import assert from 'node:assert/strict';
import { isAllowedApiOrigin } from '../utils/api-origin';

const configured = ['https://www.ribathulquran.in', 'http://localhost:3000'];
for (const origin of ['http://localhost:3001', 'http://127.0.0.1:3002', 'http://[::1]:3001']) {
    assert.equal(isAllowedApiOrigin(origin, configured, false), true, `development: ${origin}`);
    assert.equal(isAllowedApiOrigin(origin, configured, true), false, `production: ${origin}`);
}
for (const production of [false, true]) {
    assert.equal(isAllowedApiOrigin(undefined, configured, production), true);
    assert.equal(isAllowedApiOrigin(configured[0], configured, production), true);
    for (const origin of ['https://example.com', 'http://localhost.evil.test:3001', 'http://localhost:3001/path', 'null', 'file://localhost']) {
        assert.equal(isAllowedApiOrigin(origin, configured, production), false, origin);
    }
}
console.log('API origin checks passed: development loopback ports allowed; production allowlist preserved.');
