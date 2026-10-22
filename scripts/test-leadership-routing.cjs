const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { NextRequest } = require('next/server')

function load(path, mocks = {}) {
  const source = fs.readFileSync(path, 'utf8')
  const context = { exports: {}, process: { env: {} }, console, URL, atob,
    require(name) { return name in mocks ? mocks[name] : require(name) } }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context)
  return context.exports
}
const { proxy } = load('src/proxy.ts', { '@vercel/edge-config': { get: async () => false } })
const auth = load('src/lib/auth.ts', { '@/lib/api': {} })
const paths = load('src/lib/portal-paths.ts')
const scope = new Map(); let invalidations = 0
// Focus helpers use sessionStorage: evaluate them in an isolated mock browser.
const focusContext = { exports: {}, sessionStorage: { setItem(k,v) { scope.set(k,v) }, removeItem(k) { scope.delete(k) } }, require() { return { invalidateCache() { invalidations++ } } } }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/mentor-focus.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,focusContext)
const token = role => `preview.${Buffer.from(JSON.stringify({role})).toString('base64')}.not-a-real-signature`
async function destination(path, role, host = 'localhost:3000') {
  const headers = { host }; if(role) headers.cookie = `auth_token=${token(role)}`
  const response = await proxy(new NextRequest(`http://${host}${path}`, { headers }))
  return response.headers.get('location')
}
(async () => {
  for (const role of ['principal','vice_principal']) {
    assert.equal(auth.getRedirectPathForRole(role), '/leadership')
    assert.equal(await destination('/login',role),'http://localhost:3000/leadership')
    assert.equal(await destination('/staff',role),'http://localhost:3000/leadership')
    assert.equal(await destination('/staff/attendance?date=2026-10-22',role),'http://localhost:3000/leadership/attendance?date=2026-10-22')
    assert.equal(await destination('/leadership',role),null)
    assert.equal(await destination('/leadership/mentor',role),null)
    assert.equal(paths.getFocusDestination(role,true),'/leadership/mentor')
    assert.equal(paths.getFocusDestination(role,false),'/leadership')
  }
  assert.equal(await destination('/leadership',null),'http://localhost:3000/login')
  for(const role of ['staff','usthad','mentor']) {
    assert.equal(await destination('/leadership',role),'http://localhost:3000/staff')
    assert.equal(await destination('/staff',role),null)
    assert.equal(auth.getRedirectPathForRole(role),'/staff')
  }
  assert.equal(await destination('/leadership','admin'),null)
  assert.equal(await destination('/login','admin'),'http://localhost:3000/admin')
  assert.equal(await destination('/leadership','parent','parents.localhost'),'http://parents.localhost/login')
  assert.equal(paths.getStaffPortalBase('/leadership/reports'),'/leadership')
  assert.equal(paths.getStaffPortalBase('/staff/reports'),'/staff')
  focusContext.exports.setMentorFocus('test-context','Preview mentor')
  assert.equal(scope.get('mentorFocus'),'1'); assert.equal(invalidations,1)
  focusContext.exports.clearMentorFocus(); assert.equal(scope.size,0); assert.equal(invalidations,2)
  assert(!fs.readFileSync('src/app/staff/page.tsx','utf8').includes('SupervisorHome'))
  assert(!fs.readFileSync('src/components/staff/MentorDashboard.tsx','utf8').includes('SupervisorHome'))
  assert(!fs.readFileSync('src/components/leadership/LeadershipDashboard.tsx','utf8').includes('staff-gradient-surface'))
  assert(!fs.readFileSync('src/components/leadership/LeadershipLeaderboard.tsx','utf8').includes('SheetContent'))
  console.log('Leadership routing, role isolation, legacy links, and focus cache invalidation passed.')
})().catch(error => { console.error(error); process.exit(1) })
