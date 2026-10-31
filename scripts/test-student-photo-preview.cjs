// Run against a local Next server; every API call and photo is mocked.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/swabe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const origin = process.env.STUDENT_PHOTO_TEST_ORIGIN || 'http://localhost:3000'
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local test server only')
const cookie = `preview.${Buffer.from(JSON.stringify({ role: 'admin' })).toString('base64')}.not-a-real-signature`

;(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true })
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
        await context.addCookies([{ name: 'auth_token', value: cookie, url: origin, httpOnly: true }])
        const page = await context.newPage()
        page.setDefaultTimeout(60000)
        const errors = [], saved = []
        page.on('pageerror', error => errors.push(error.message))
        const png = async color => Buffer.from(await page.evaluate(color => {
            const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 12
            const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 8, 12)
            return canvas.toDataURL('image/png').split(',')[1]
        }, color), 'base64')
        const red = await png('#ff0000'), blue = await png('#0000ff')
        const student = { adm_no: 'R292', name: 'Photo Test Student', status: 'active', standard: '8th', gender: 'Male', nationality: 'Indian', phone_number: '', photo_url: origin + '/photo-test/old.png' }
        let uploadMode = 'hold', uploadCount = 0, releaseUpload, uploadFinished
        await page.route('**/photo-test/**', route => route.fulfill({ contentType: 'image/png', body: route.request().url().endsWith('/old.png') ? red : blue }))
        await page.route('**/api/**', async route => {
            const request = route.request(), path = new URL(request.url()).pathname
            if (path.endsWith('/upload/avatar')) {
                uploadCount++
                assert(request.postDataBuffer().includes(Buffer.from('student_admission_number')))
                assert(request.postDataBuffer().includes(Buffer.from('R292')))
                let response = { status: 200, json: { success: true, filePath: origin + `/photo-test/replacement-${uploadCount}.png` } }
                if (uploadMode === 'error') response = { status: 500, json: { success: false, error: 'Photo storage unavailable. Select the photo again to retry.' } }
                if (uploadMode === 'hold') await new Promise(resolve => { releaseUpload = resolve })
                try { await route.fulfill(response) } catch { /* A cancelled selection can abort its browser request. */ }
                uploadFinished?.()
                return
            }
            if (path === '/api/students/R292') {
                if (request.method() === 'PUT') { const update = request.postDataJSON(); saved.push(update); Object.assign(student, update) }
                return route.fulfill({ json: { success: true, student } })
            }
            if (path.endsWith('/auth/me')) return route.fulfill({ json: { success: true, user: { id: 'photo-test-admin', name: 'Test Admin', role: 'admin' } } })
            return route.fulfill({ json: { success: true, staff: [], students: [], data: [], years: [] } })
        })
        await page.goto(origin + '/admin/students/R292')
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
        await page.getByRole('button', { name: 'Edit Profile', exact: true }).click()
        const fileInput = page.getByLabel('Choose student photo', { exact: true })
        const preview = page.getByAltText('Selected student photo preview', { exact: true })
        const saveButtons = page.getByRole('button', { name: 'Save Changes', exact: true })
        const save = saveButtons.first()
        const cancel = page.getByRole('button', { name: 'Cancel', exact: true }).first()
        const chosen = { name: 'selected-blue.png', mimeType: 'image/png', buffer: blue }
        await fileInput.setInputFiles(chosen)
        await page.waitForFunction(() => document.querySelector('img[alt="Selected student photo preview"]')?.getAttribute('src')?.startsWith('blob:'))
        assert(await save.isDisabled(), 'saving is blocked while the selected image uploads')
        assert((await Promise.all((await saveButtons.all()).map(button => button.isDisabled()))).every(Boolean), 'both Save buttons wait for the upload')
        const pixel = await preview.evaluate(async image => {
            await image.decode()
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
            canvas.getContext('2d').drawImage(image, 0, 0, 1, 1)
            return Array.from(canvas.getContext('2d').getImageData(0, 0, 1, 1).data)
        })
        assert.deepEqual(pixel, [0, 0, 255, 255], 'the preview shows the selected blue file, not the saved red photo')
        await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Uploading selected photo'))
        for (let i = 0; !releaseUpload && i < 1000; i++) await page.waitForTimeout(10)
        assert.equal(typeof releaseUpload, 'function', 'the mocked upload request started')
        releaseUpload()
        await page.getByText('New photo ready. Save Changes to update the student profile.', { exact: true }).waitFor()
        await cancel.click()
        assert((await page.getByAltText('Profile', { exact: true }).getAttribute('src')).endsWith('/old.png'), 'cancel restores the saved photo')
        assert.equal(saved.length, 0)

        await page.getByRole('button', { name: 'Edit Profile', exact: true }).click()
        uploadMode = 'error'
        await fileInput.setInputFiles(chosen)
        await page.getByRole('alert').filter({ hasText: 'Photo storage unavailable' }).waitFor()
        assert(await save.isDisabled(), 'a failed upload cannot silently save the old photo')
        assert((await preview.getAttribute('src')).startsWith('blob:'))
        uploadMode = 'success'
        await fileInput.setInputFiles(chosen)
        await page.getByText('New photo ready. Save Changes to update the student profile.', { exact: true }).waitFor()
        assert(await save.isEnabled())
        await save.click()
        await page.getByText('Student profile updated successfully.', { exact: true }).waitFor()
        assert.equal(saved.length, 1)
        assert.equal(saved[0].photo_url, origin + '/photo-test/replacement-3.png')
        await page.reload()
        await page.getByRole('button', { name: 'Edit Profile', exact: true }).waitFor()
        assert.equal(await page.getByAltText('Profile', { exact: true }).getAttribute('src'), student.photo_url, 'saved replacement survives reload')

        await page.getByRole('button', { name: 'Edit Profile', exact: true }).click()
        uploadMode = 'hold'; releaseUpload = null
        await fileInput.setInputFiles({ ...chosen, name: 'cancelled.png' })
        for (let i = 0; !releaseUpload && i < 1000; i++) await page.waitForTimeout(10)
        assert.equal(typeof releaseUpload, 'function', 'the cancelled upload request started')
        const finished = new Promise(resolve => { uploadFinished = resolve })
        await cancel.click()
        releaseUpload(); await finished
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        assert.equal(await page.getByAltText('Profile', { exact: true }).getAttribute('src'), student.photo_url, 'late upload completion cannot undo cancel')
        await page.getByRole('button', { name: 'Edit Profile', exact: true }).click()
        await page.getByRole('button', { name: 'Remove photo', exact: true }).click()
        await save.click()
        await page.getByText('Student profile updated successfully.', { exact: true }).waitFor()
        assert.equal(saved.at(-1).photo_url, null)
        assert.deepEqual(errors, [])
        console.log('Student photo preview passed: selected file pixels, pending/failed save guards, retry, cancel, save/reload, late responses and removal. All API calls were mocked.')
        await context.close()
    } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
