export type MobilePlatform = 'android' | 'ios';

export type RegisterDeviceInput = {
  installationId: string;
  platform: MobilePlatform;
  deviceName: string | null;
  appVersion: string | null;
  osVersion: string | null;
  pushToken: string | null;
};

export type MobileLoginInput = RegisterDeviceInput & {
  email: string;
  password: string;
};

// Accept canonical UUID text regardless of version. PostgreSQL performs the
// final uuid cast; this also supports modern UUIDv7 installation identifiers.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return undefined;
  return normalized;
}

export function parseRegisterDeviceInput(body: unknown): RegisterDeviceInput | null {
  if (!body || typeof body !== 'object') return null;
  const input = body as Record<string, unknown>;
  const installationId = optionalText(input.installationId, 200);
  const platform = input.platform;
  const deviceName = optionalText(input.deviceName, 200);
  const appVersion = optionalText(input.appVersion, 50);
  const osVersion = optionalText(input.osVersion, 100);
  const pushToken = optionalText(input.pushToken, 2048);

  if (!installationId || (platform !== 'android' && platform !== 'ios')) return null;
  if (deviceName === undefined || appVersion === undefined || osVersion === undefined || pushToken === undefined) {
    return null;
  }

  return { installationId, platform, deviceName, appVersion, osVersion, pushToken };
}

export function parseMobileLoginInput(body: unknown): MobileLoginInput | null {
  if (!body || typeof body !== 'object') return null;
  const input = body as Record<string, unknown>;
  const device = parseRegisterDeviceInput(input);
  const email = optionalText(input.email, 320);
  const password = typeof input.password === 'string' ? input.password : '';
  if (!device || !email || !password || password.length > 1024) return null;
  return { ...device, email: email.toLowerCase(), password };
}

export function parseRefreshInput(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const input = body as Record<string, unknown>;
  const deviceId = parseDeviceId(input.deviceId);
  const refreshToken = optionalText(input.refreshToken, 1024);
  if (!deviceId || !refreshToken || refreshToken.length < 32) return null;
  return { deviceId, refreshToken };
}

export function parseDeviceId(value: unknown) {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string' && UUID_PATTERN.test(text.trim()) ? text.trim() : null;
}

export function parseSyncCursor(value: unknown) {
  const text = Array.isArray(value) ? value[0] : value;
  if (text === undefined || text === null || text === '') return 0;
  const cursor = Number(text);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : null;
}

export function parseSyncLimit(value: unknown) {
  const text = Array.isArray(value) ? value[0] : value;
  if (text === undefined || text === null || text === '') return 250;
  const limit = Number(text);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= 500 ? limit : null;
}
