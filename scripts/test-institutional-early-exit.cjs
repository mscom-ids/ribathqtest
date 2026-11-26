// Run against a local Next server; all API calls are intercepted and mocked.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/swabe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const origin = process.env.INSTITUTIONAL_EXIT_TEST_ORIGIN || 'http://localhost:3000'
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local test server only')
const cookie = `preview.${Buffer.from(JSON.stringify({ role: 'admin' })).toString('base64')}.not-a-real-signature`
const start = '2030-02-01T10:00:00+05:30', end = '2030-02-01T18:00:00+05:30'
const early = '2030-02-01T09:00:00+05:30'
const institution = {
    id: 'institution-test', name: 'Scheduled Outside Leave', start_datetime: start, end_datetime: end,
    target_classes: [], target_student_ids: [], campus_location: 'outside', is_entire_institution: true,
    total_students: '0', returned_students: '0', created_at: '2030-01-31T00:00:00Z',
}
const inside = { ...institution, id: 'inside-test', name: 'Inside Campus Programme', campus_location: 'inside' }
const history = [
    { id: 'early-normal', student_name: 'Early Normal Return', exit_status: 'early', status: 'returned', return_status: 'normal', actual_return_datetime: '2030-02-01T17:00:00+05:30' },
    { id: 'early-late', student_name: 'Early Late Return', exit_status: 'early', status: 'returned', return_status: 'late', actual_return_datetime: '2030-02-01T19:00:00+05:30' },
    { id: 'early-outside', student_name: 'Early Still Outside', exit_status: 'early', status: 'outside', return_status: null, actual_return_datetime: null },
    { id: 'exact-start', student_name: 'Exact Start Exit', exit_status: 'normal', status: 'returned', return_status: 'normal', actual_return_datetime: end, start_datetime: start },
    { id: 'personal', student_name: 'Personal Leave', leave_type: 'out-campus', exit_status: null, status: 'outside', return_status: null, scheduled_start_datetime: null },
].map((row, index) => ({
    student_id: `R9${index}0`, student_adm_no: `R9${index}0`, school_standard: '7th',
    leave_type: 'institutional', start_datetime: early, end_datetime: end,
    scheduled_start_datetime: start, reason_category: 'Institutional Leave', ...row,
}))
const outside = {
    leave_id: 'early-outside', student_id: 'R920', student_name: 'Early Still Outside', adm_no: 'R920', standard: '7th',
    leave_type: 'institutional', start_datetime: early, actual_exit_datetime: early, end_datetime: end,
    institutional_leave_name: institution.name, scheduled_start_datetime: start, exit_status: 'early', photo_url: null,
}

;(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true })
    try {
        const context = await browser.newContext({ viewport: { width: 1536, height: 1050 }, timezoneId: 'Asia/Kolkata' })
        await context.addCookies([{ name: 'auth_token', value: cookie, url: origin, httpOnly: true }])
        const errors = [], saved = [], unexpectedMutations = []
        const eligible = [
            { adm_no: 'R901', name: 'Alpha Student', standard: '7th', is_outside: false, has_institutional_record: false },
            { adm_no: 'R902', name: 'Beta Student', standard: '8th', is_outside: false, has_institutional_record: false },
            { adm_no: 'R903', name: 'Gamma Student', standard: '8th', is_outside: false, has_institutional_record: false },
        ]
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url()), path = url.pathname
            if (path.startsWith('/api/')) {
                if (path.endsWith('/auth/me')) return route.fulfill({ json: { success: true, user: { id: 'early-exit-test-admin', name: 'Test Admin', role: 'admin' } } })
                if (path === '/api/leaves/institutional') return route.fulfill({ json: { success: true, leaves: [institution, inside] } })
                if (path.endsWith('/eligible-students')) return route.fulfill({ json: { success: true, students: eligible.filter(student => !saved.some(item => item.student_ids.includes(student.adm_no))) } })
                if (path.endsWith('/mark-exit')) {
                    assert.equal(request.method(), 'POST')
                    saved.push(request.postDataJSON())
                    return route.fulfill({ status: 201, json: { success: true, count: saved.at(-1).student_ids.length } })
                }
                if (path === '/api/leaves/outside-students') return route.fulfill({ json: { success: true, students: [outside] } })
                if (path === '/api/leaves') return route.fulfill({ json: { success: true, leaves: history, pagination: { total: history.length } } })
                if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) unexpectedMutations.push(`${request.method()} ${path}`)
                return route.fulfill({ json: { success: true, staff: [], students: [], leaves: [], data: [], years: [], notifications: [] } })
            }
            if (url.origin !== new URL(origin).origin) return route.abort()
            return route.continue()
        })
        const page = await context.newPage()
        page.setDefaultTimeout(60000)
        page.on('pageerror', error => errors.push(error.message))
        await page.goto(origin + '/admin/leaves')
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
        await page.getByText('Early Still Outside', { exact: true }).waitFor()
        assert.equal(await page.getByText('Early Exit', { exact: true }).count(), 1, 'ongoing outside card shows Early Exit')
        assert.match(await page.locator('main').innerText(), /Scheduled: 01 Feb, 10:00 AM/)

        await page.getByRole('button', { name: 'History', exact: true }).click()
        await page.getByRole('columnheader', { name: 'Exit Status', exact: true }).waitFor()
        for (const [name, exitLabel, returnLabel] of [
            ['Early Normal Return', 'Early Exit', 'NORMAL'],
            ['Early Late Return', 'Early Exit', 'LATE'],
            ['Early Still Outside', 'Early Exit', 'ONGOING'],
            ['Exact Start Exit', 'Normal', 'NORMAL'],
        ]) {
            const row = page.getByRole('row').filter({ has: page.getByText(name, { exact: true }) })
            await row.waitFor()
            assert.equal((await row.getByRole('cell').nth(2).innerText()).trim(), exitLabel, `${name}: independent exit status`)
            assert.equal((await row.getByRole('cell').nth(9).innerText()).trim(), returnLabel, `${name}: independent return status`)
            if (exitLabel === 'Early Exit') assert.match(await row.getByRole('cell').nth(1).innerText(), /Scheduled: 01-02-2030 - 10:00 AM/)
        }
        const personal = page.getByRole('row').filter({ has: page.getByText('Personal Leave', { exact: true }) })
        assert.equal((await personal.getByRole('cell').nth(2).innerText()).trim(), '—', 'unrelated personal leaves do not get institutional exit status')
        await page.screenshot({ path: 'tmp/institutional-early-exit-history.png', fullPage: true })

        await page.getByRole('button', { name: 'Institution', exact: true }).click()
        const outsideRow = page.getByRole('row').filter({ has: page.getByText(institution.name, { exact: true }) })
        const insideRow = page.getByRole('row').filter({ has: page.getByText(inside.name, { exact: true }) })
        await outsideRow.waitFor()
        assert.equal(await insideRow.getByRole('button', { name: 'Mark Exit', exact: true }).count(), 0, 'inside-campus leave has no exit action')
        assert.match(await outsideRow.innerText(), /Scheduled/, 'a future leave can be marked out')
        await outsideRow.getByRole('button', { name: 'Mark Exit', exact: true }).click()
        const dialog = page.getByRole('dialog'), dateInput = dialog.locator('input[type="datetime-local"]')
        await dialog.getByText('Choose student...', { exact: true }).waitFor()
        const preview = dialog.getByRole('status')
        await dateInput.fill('2030-02-01T09:59')
        await preview.waitFor()
        assert.match(await preview.innerText(), /Early Exit/)
        await dateInput.fill('2030-02-01T10:00')
        await preview.waitFor({ state: 'detached' })
        await dateInput.fill('2030-02-01T11:00')
        assert.equal(await preview.count(), 0, 'after scheduled start is not early')
        await dateInput.fill('2030-02-01T09:00')
        await preview.waitFor()
        await dialog.getByPlaceholder('Person name').fill('Test Guardian')
        await dialog.getByPlaceholder('Parent, uncle, driver...').fill('Parent')
        await dialog.getByRole('combobox').nth(1).click()
        await page.getByRole('option', { name: /Alpha Student/ }).click()
        await dialog.getByRole('button', { name: 'Mark Exit', exact: true }).click()
        await dialog.waitFor({ state: 'detached' })
        assert.equal(saved.length, 1)
        assert.deepEqual(saved[0], { student_ids: ['R901'], exit_datetime: '2030-02-01T03:30:00.000Z', companion_name: 'Test Guardian', companion_relationship: 'Parent' }, 'single early exit sends actual timestamp in UTC')

        await outsideRow.getByRole('button', { name: 'Mark Exit', exact: true }).click()
        await dialog.getByText('Choose student...', { exact: true }).waitFor()
        await dateInput.fill('2030-02-01T08:30')
        await preview.waitFor()
        await dialog.getByPlaceholder('Person name').fill('Bulk Guardian')
        await dialog.getByPlaceholder('Parent, uncle, driver...').fill('Driver')
        await dialog.getByRole('checkbox').check()
        await dialog.getByRole('button', { name: 'Mark Exit', exact: true }).click()
        await dialog.waitFor({ state: 'detached' })
        assert.equal(saved.length, 2)
        assert.deepEqual(saved[1], { student_ids: ['R902', 'R903'], exit_datetime: '2030-02-01T03:00:00.000Z', companion_name: 'Bulk Guardian', companion_relationship: 'Driver' }, 'bulk early exit sends every eligible student and actual timestamp')

        await page.setViewportSize({ width: 390, height: 844 })
        await page.getByRole('button', { name: /^Outside/ }).click()
        await page.getByText('Early Still Outside', { exact: true }).waitFor()
        await page.getByText('Early Exit', { exact: true }).waitFor()
        const badge = await page.getByText('Early Exit', { exact: true }).boundingBox()
        assert(badge && badge.x >= 0 && badge.x + badge.width <= 390, 'mobile outside badge remains within viewport')
        await page.getByRole('button', { name: 'History', exact: true }).click()
        await page.getByRole('columnheader', { name: 'Exit Status', exact: true }).waitFor()
        assert.equal(await page.getByText('Early Exit', { exact: true }).count(), 3, 'history retains early badges at mobile width')
        assert.deepEqual(unexpectedMutations, [], 'test sends only explicitly mocked mark-exit mutations')
        assert.deepEqual(errors, [], 'no browser runtime errors')
        console.log('Institutional early exit browser regression passed: early/exact/on-time preview, single and bulk actual timestamps, outside badge, independent early exit and NORMAL/LATE return history, inside-campus restriction, and mobile smoke. All API calls were mocked.')
        await context.close()
    } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
