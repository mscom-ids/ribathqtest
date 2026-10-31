// Local browser regression: one admin-saved photo, shared by every portal.
// All API requests and image responses are mocked; no real records are changed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/swabe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const origin = process.env.STUDENT_PHOTO_TEST_ORIGIN || 'http://localhost:3000'
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local test server only')
const savedPhoto = '/public/avatars/student-photo-qa-saved.png'
const cloudPhoto = 'https://student-photos.example.invalid/cloud-photo.png'
const student = { adm_no: 'R389', name: 'Saved Photo Student', standard: '7th', status: 'active', gender: 'Male', phone_number: '', photo_url: '/public/avatars/student-photo-qa-old.png' }
const roster = () => [student, { ...student, adm_no: 'R390', name: 'Cloud Photo Student', photo_url: cloudPhoto }, { ...student, adm_no: 'R184', name: 'No Photo Student', photo_url: null }]
const mentor = { id: 'photo-qa-mentor', name: 'Photo QA Mentor', role: 'usthad', is_active: true, photo_url: null }

;(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true })
    try {
        const canvasPage = await browser.newPage()
        const png = Buffer.from(await canvasPage.evaluate(() => {
            const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 12
            const ctx = canvas.getContext('2d'); ctx.fillStyle = '#2244ff'; ctx.fillRect(0, 0, 8, 12)
            return canvas.toDataURL('image/png').split(',')[1]
        }), 'base64')
        await canvasPage.close()

        async function portal(role, width) {
            // Parent routing normally lives on its own hostname. Simulate that
            // forwarded host locally so the test never navigates to a live site.
            const context = await browser.newContext({ viewport: { width, height: 1000 }, extraHTTPHeaders: role === 'parent' ? { 'x-forwarded-host': process.env.STUDENT_PHOTO_PARENT_HOST || 'parents.localhost' } : {} })
            const cookie = `preview.${Buffer.from(JSON.stringify({ role })).toString('base64')}.not-a-real-signature`
            await context.addCookies([{ name: 'auth_token', value: cookie, url: origin, httpOnly: true }])
            const page = await context.newPage(), errors = []
            page.setDefaultTimeout(60000)
            page.on('pageerror', error => errors.push(error.message))
            await page.route('**/public/avatars/student-photo-qa-*.png', route => route.fulfill({ contentType: 'image/png', body: png }))
            await page.route(cloudPhoto, route => route.fulfill({ contentType: 'image/png', body: png }))
            await page.route('**/api/**', route => {
                const request = route.request(), path = new URL(request.url()).pathname
                let body = { success: true, data: [], staff: [], students: [], years: [] }
                if (path.endsWith('/auth/me')) body.user = { id: 'photo-qa-user', name: 'Photo QA User', role }
                else if (path.endsWith('/upload/avatar')) { assert.equal(role, 'admin'); body.filePath = savedPhoto }
                else if (path === '/api/students/R389') {
                    if (request.method() === 'PUT') { assert.equal(role, 'admin'); Object.assign(student, request.postDataJSON()) }
                    body.student = student
                }
                else if (path.endsWith('/staff/me')) body.staff = mentor
                else if (path.endsWith('/dashboard/staff')) body.summary = { profile: mentor, students: roster(), schedules: [], monthly_report: [] }
                else if (path.endsWith('/dashboard/admin')) body.summary = { students: { active: 3, on_campus: 3, out_campus: 0 }, staff: { active: 1 } }
                else if (path.endsWith('/daily-stats')) body.students = { present: 3, total: 3 }
                else if (path === '/api/staff') body.staff = [mentor]
                else if (path.endsWith('/students')) body.students = roster()
                else if (path.endsWith('/calculate')) body.reports = []
                else if (path === '/api/hifz/students/R389/month') body = { student: { id: student.adm_no, admNo: student.adm_no, name: student.name, class: student.standard, division: null, hifzStage: 'MEMORIZING' }, month: '2026-10', days: [], summary: {} }
                else if (path === '/api/parent/dashboard') body = { success: true, student, period: { month: '2026-10' }, attendance: {}, hifz_attendance: {}, hifz_report: null, hifz_logs: [], reports: [], exams: [] }
                return route.fulfill({ json: body })
            })
            return { context, page, errors }
        }

        async function loaded(image, url) {
            await image.waitFor()
            assert.equal(await image.getAttribute('src'), url)
            assert(await image.evaluate(async img => { await img.decode(); return img.naturalWidth === 8 }), 'saved image loads')
        }
        async function hideDevelopmentBadge(page) { await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' }) }

        const admin = await portal('admin', 1440)
        await admin.page.goto(origin + '/admin/students/R389')
        await hideDevelopmentBadge(admin.page)
        await admin.page.getByRole('button', { name: 'Edit Profile', exact: true }).click()
        await admin.page.getByLabel('Choose student photo', { exact: true }).setInputFiles({ name: 'shared-photo.png', mimeType: 'image/png', buffer: png })
        await admin.page.getByText('New photo ready. Save Changes to update the student profile.', { exact: true }).waitFor()
        await admin.page.getByRole('button', { name: 'Save Changes', exact: true }).first().click()
        await admin.page.getByText('Student profile updated successfully.', { exact: true }).waitFor()
        assert.equal(student.photo_url, savedPhoto)
        assert.deepEqual(admin.errors, [])
        await admin.context.close()

        for (const width of [390, 1440]) {
            const staff = await portal('usthad', width), page = staff.page
            await page.goto(origin + '/staff'); await hideDevelopmentBadge(page)
            await page.getByRole('button', { name: 'All Students', exact: true }).click()
            const image = page.getByRole('img', { name: student.name, exact: true })
            await loaded(image, savedPhoto)
            await loaded(page.getByRole('img', { name: 'Cloud Photo Student', exact: true }), cloudPhoto)
            assert.equal(await page.getByRole('img', { name: 'No Photo Student', exact: true }).count(), 0)
            await image.locator('..').locator('..').getByRole('button', { name: /Open progress/ }).click()
            await loaded(page.getByRole('dialog').locator('img[data-slot="avatar-image"]').first(), savedPhoto)
            assert.deepEqual(staff.errors, [])
            await staff.context.close()

            const leader = await portal('vice_principal', width)
            await leader.page.goto(origin + '/leadership'); await hideDevelopmentBadge(leader.page)
            await loaded(leader.page.getByRole('img', { name: student.name, exact: true }), savedPhoto)
            await loaded(leader.page.getByRole('img', { name: 'Cloud Photo Student', exact: true }), cloudPhoto)
            await leader.page.getByRole('button', { name: `Open progress for ${student.name}`, exact: true }).click()
            await loaded(leader.page.getByRole('dialog').locator('img[data-slot="avatar-image"]').first(), savedPhoto)
            assert.deepEqual(leader.errors, [])
            await leader.context.close()

            const parent = await portal('parent', width)
            await parent.page.goto(origin + '/home')
            await loaded(parent.page.getByRole('img', { name: student.name, exact: true }), savedPhoto)
            assert.deepEqual(parent.errors, [])
            await parent.context.close()
            console.log(`Shared admin photo passed for mentor, leadership, parent and progress headers at ${width}px, including cloud photos and missing-photo fallbacks.`)
        }
    } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
