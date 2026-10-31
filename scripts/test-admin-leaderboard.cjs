// Local UI regression. All APIs are mocked; no real records are read or written.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/swabe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const origin = process.env.ADMIN_LEADERBOARD_TEST_ORIGIN || 'http://localhost:3031'
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local test server only')
const students = Array.from({ length: 12 }, (_, i) => ({ adm_no: `QA${i}`, name: `Leaderboard student ${i + 1}`, standard: '7th', photo_url: i === 0 ? '/qa-student.svg' : null }))
const reports = students.map((s, i) => ({ ...s, photo_url: undefined, totalPoints: i === 0 ? 114.89 : i === 11 ? 0 : 107 - i * 3, bonusPoints: i === 0 ? 14.96 : 0, grade: i === 0 ? 'O' : i === 11 ? 'NO GRADE' : 'A', hifz_stage: i === 1 ? 'HAFIZ_REVISION' : 'MEMORIZING' }))
const mentor = { id: 'qa-mentor', name: 'Preview mentor', role: 'usthad', is_active: true }

;(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true })
    try {
        for (const width of [390, 834, 1440].filter(width => !process.env.ADMIN_LEADERBOARD_WIDTH || width === Number(process.env.ADMIN_LEADERBOARD_WIDTH))) {
            const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'Asia/Kolkata' })
            const cookie = `preview.${Buffer.from(JSON.stringify({ role: 'admin' })).toString('base64')}.not-a-real-signature`
            await context.addCookies([{ name: 'auth_token', value: cookie, url: origin, httpOnly: true }])
            const page = await context.newPage(), errors = [], requests = []
            page.setDefaultTimeout(60000)
            await page.clock.setFixedTime(new Date('2026-10-31T12:00:00Z'))
            page.on('pageerror', error => errors.push(error.message))
            await page.route('**/qa-student.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="240"><rect width="180" height="240" fill="#a5b6c6"/><circle cx="90" cy="78" r="40" fill="#e3cfb3"/><path d="M15 240v-45c0-75 150-75 150 0v45" fill="#324b68"/></svg>' }))
            await page.route('**/api/**', route => {
                const request = route.request(), url = new URL(request.url()), path = url.pathname
                assert.equal(request.method(), 'GET', 'leaderboard and progress inspection never mutate data')
                requests.push(url)
                let body = { success: true, data: [], staff: [], students: [], years: [], events: [], conversations: [] }
                if (path.endsWith('/auth/me')) body.user = { id: 'qa-admin', name: 'Preview Admin', role: 'admin' }
                else if (path.endsWith('/dashboard/admin')) body.summary = { students: { active: 12, on_campus: 12, out_campus: 0, alumni: 0, completed: 0, dropout: 0 }, staff: { total: 1, active: 1, inactive: 0 }, events: [] }
                else if (path.endsWith('/daily-stats')) Object.assign(body, { students: { present: 12, absent: 0, late: 0, total: 12 }, mentors: { present: 1, absent: 0, late: 0, total: 1 } })
                else if (path === '/api/staff') body.staff = [mentor, { ...mentor, id: 'inactive', name: 'Inactive mentor', is_active: false }, { ...mentor, id: 'admin', name: 'Admin user', role: 'admin' }]
                else if (path === '/api/students') body.students = students
                else if (path.endsWith('/monthly-reports/calculate')) {
                    const month = url.searchParams.get('month')
                    if (month === '2026-08') return route.fulfill({ status: 500, json: { success: false } })
                    body.reports = month === '2026-07' ? [] : month === '2026-09' ? reports.map((r, i) => ({ ...r, totalPoints: i < 3 ? 100 : r.totalPoints })) : url.searchParams.get('mentor_id') === mentor.id ? reports.slice(0, 4) : reports
                }
                else if (path === '/api/hifz/students/QA0/month') body = { student: { id: 'QA0', admNo: 'QA0', name: students[0].name, class: '7th', division: null, hifzStage: 'MEMORIZING' }, month: '2026-10', days: [], summary: {} }
                return route.fulfill({ json: body })
            })
            await page.goto(origin + '/admin')
            await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
            const trigger = page.getByRole('button', { name: 'Top Performers', exact: true })
            await trigger.waitFor()
            assert.equal(requests.filter(url => url.pathname.endsWith('/calculate')).length, 0, 'monthly scores load only when opened')
            await trigger.click()
            const panel = page.locator('.admin-leaderboard')
            await panel.getByText('12 students', { exact: true }).waitFor().catch(async error => {
                await page.screenshot({ path: `tmp/admin-leaderboard-failure-${width}.png` })
                console.error({ width, errors, requests: requests.map(url => url.pathname + url.search), panel: await panel.textContent().catch(() => 'not mounted') })
                throw error
            })
            await panel.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))))
            assert.equal(await panel.evaluate(el => getComputedStyle(el).animationName), 'admin-leaderboard-enter')
            assert.equal(await panel.locator('[data-student-id]').count(), 12, 'includes students with zero earned points')
            assert.deepEqual(await panel.locator('.points-leader').evaluateAll(rows => rows.map(row => row.dataset.rank)), ['2', '1', '3'])
            const winner = panel.locator('[data-student-id="QA0"]')
            assert.match(await winner.innerText(), /114\.89/)
            assert.match(await winner.innerText(), /14\.96 bonus/)
            assert.match(await winner.innerText(), /Outstanding/)
            const portrait = winner.locator('img')
            await portrait.waitFor()
            assert.equal(await portrait.getAttribute('src'), '/qa-student.svg', 'photo comes from the canonical student roster')
            assert(await portrait.evaluate(async img => { await img.decode(); return img.naturalWidth === 180 }))
            assert.match(await panel.locator('[data-student-id="QA1"]').innerText(), /7th · Hafiz/)
            assert.equal(await panel.locator('.points-place-frame').count(), 10, 'top ten have the shared place banners')
            const bounds = await panel.boundingBox()
            assert(Math.abs(bounds.x + bounds.width - width) <= 1, 'drawer is anchored to the right edge')
            assert(bounds.width <= Math.min(560, width), 'drawer fits phone, tablet and desktop')
            assert(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'no horizontal drawer overflow')
            if (process.env.ADMIN_LEADERBOARD_SCREENSHOTS === '1') await page.screenshot({ path: `tmp/admin-leaderboard-${width}.png` })

            async function select(label, option) {
                await panel.getByRole('combobox', { name: label, exact: true }).click()
                await page.getByRole('option', { name: option, exact: true }).click()
            }
            await select('Leaderboard mentor', mentor.name)
            await panel.getByText('4 students', { exact: true }).waitFor()
            assert(requests.some(url => url.searchParams.get('mentor_id') === mentor.id))
            await select('Leaderboard mentor', 'All students')
            await panel.getByText('12 students', { exact: true }).waitFor()
            await select('Leaderboard month', 'Sep 2026')
            await page.waitForFunction(() => document.querySelectorAll('.admin-leaderboard .points-leader[data-rank="1"]').length === 3)
            await select('Leaderboard month', 'Aug 2026')
            await panel.getByRole('alert').waitFor()
            await select('Leaderboard month', 'Jul 2026')
            await panel.getByText('No students in this selection.', { exact: true }).waitFor()
            await select('Leaderboard month', 'Oct 2026')
            await panel.getByText('12 students', { exact: true }).waitFor()
            await panel.locator('[data-student-id="QA0"]').click()
            await panel.waitFor({ state: 'hidden' })
            const progress = page.getByRole('dialog')
            await progress.getByRole('heading', { name: students[0].name, exact: true }).waitFor()
            await progress.getByRole('button', { name: 'Close progress register', exact: true }).click()
            await progress.waitFor({ state: 'hidden' })
            await trigger.click()
            await panel.waitFor()
            await page.keyboard.press('Escape')
            await panel.waitFor({ state: 'hidden' })
            assert(await trigger.evaluate(el => document.activeElement === el), 'keyboard focus returns to the dashboard trigger')
            await page.emulateMedia({ reducedMotion: 'reduce' })
            await page.evaluate(() => document.documentElement.classList.add('dark'))
            await trigger.click()
            await panel.waitFor()
            assert.equal(await panel.evaluate(el => getComputedStyle(el).animationName), 'none')
            await page.getByRole('button', { name: 'Close leaderboard', exact: true }).click()
            await panel.waitFor({ state: 'hidden' })
            assert.deepEqual(errors, [])
            assert(!requests.some(url => url.pathname.includes('supervisor-focus')), 'filtering never switches admin identity')
            console.log(`Admin leaderboard passed at ${width}px: lazy load, sliding panel, shared podium/photos/grades, filters, ties, zero points, error/empty states, progress, keyboard and reduced motion.`)
            await context.close()
        }
    } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
