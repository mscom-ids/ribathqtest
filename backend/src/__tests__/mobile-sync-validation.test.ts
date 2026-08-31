import assert from 'node:assert/strict';
import {
  parseDeviceId,
  parseMobileLoginInput,
  parseRefreshInput,
  parseRegisterDeviceInput,
  parseSyncCursor,
  parseSyncLimit,
} from '../modules/mobile-sync/mobile-sync.validation';
import { parseMobileHifzMutation } from '../modules/mobile-sync/mobile-hifz.validation';

assert.deepEqual(
  parseRegisterDeviceInput({
    installationId: 'install-123',
    platform: 'android',
    deviceName: 'Pixel',
    appVersion: '1.0.0',
  }),
  {
    installationId: 'install-123',
    platform: 'android',
    deviceName: 'Pixel',
    appVersion: '1.0.0',
    osVersion: null,
    pushToken: null,
  }
);

assert.equal(parseRegisterDeviceInput({ installationId: 'x', platform: 'web' }), null);
assert.equal(parseRegisterDeviceInput({ installationId: '', platform: 'ios' }), null);
assert.equal(parseRegisterDeviceInput({ installationId: 'x', platform: 'ios', deviceName: 42 }), null);

const mobileLogin = parseMobileLoginInput({
  email: ' Mentor@Example.com ',
  password: 'secret',
  installationId: 'installation-1',
  platform: 'ios',
});
assert.equal(mobileLogin?.email, 'mentor@example.com');
assert.equal(mobileLogin?.platform, 'ios');
assert.equal(parseMobileLoginInput({ email: 'x@example.com', password: '', installationId: 'x', platform: 'ios' }), null);

assert.equal(parseDeviceId('0191b8d0-53a8-7cad-9a85-3b7a97e6c933'), '0191b8d0-53a8-7cad-9a85-3b7a97e6c933');
assert.equal(parseDeviceId('not-a-uuid'), null);
assert.deepEqual(
  parseRefreshInput({
    deviceId: '0191b8d0-53a8-7cad-9a85-3b7a97e6c933',
    refreshToken: 'a'.repeat(64),
  }),
  {
    deviceId: '0191b8d0-53a8-7cad-9a85-3b7a97e6c933',
    refreshToken: 'a'.repeat(64),
  }
);
assert.equal(parseRefreshInput({ deviceId: 'not-a-uuid', refreshToken: 'a'.repeat(64) }), null);

assert.equal(parseSyncCursor(undefined), 0);
assert.equal(parseSyncCursor('42'), 42);
assert.equal(parseSyncCursor('-1'), null);
assert.equal(parseSyncCursor('1.5'), null);

assert.equal(parseSyncLimit(undefined), 250);
assert.equal(parseSyncLimit('500'), 500);
assert.equal(parseSyncLimit('501'), null);
assert.equal(parseSyncLimit('0'), null);

console.log('mobile-sync validation tests passed');

const validHifz = parseMobileHifzMutation({
  mutationId: 'cf26ec6b-5314-4b49-9b91-7ee268f7782f',
  studentId: 'STG-M001',
  entryDate: '2026-08-20',
  mode: 'New Verses',
  surahName: 'Al-Fatihah',
  startVerse: 1,
  endVerse: 7,
});
assert.equal(validHifz.input?.studentId, 'STG-M001');
assert.equal(parseMobileHifzMutation({ ...validHifz.input, endVerse: 0 }).input, undefined);
