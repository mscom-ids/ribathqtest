// Next.js middleware — this file MUST be named middleware.ts at src/ level.
// The route-guard logic lives in proxy.ts and is re-exported here.
export { proxy as middleware, config } from './proxy';
