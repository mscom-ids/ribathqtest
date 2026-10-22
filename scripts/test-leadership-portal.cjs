// Run against a separate local Next dev server. Every API request is mocked;
// the fake cookie exercises only the Next routing guard, never backend auth.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/swabe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const origin = process.env.LEADERSHIP_TEST_ORIGIN || 'http://localhost:3020'
assert(['localhost','127.0.0.1'].includes(new URL(origin).hostname),'Tests must only target a local isolated server')
const students = Array.from({length:45},(_,i)=>({adm_no:`QA${i}`,name:`Preview student ${i+1}`,standard:'7th',photo_url:null,progress:0}))
const leader = {id:'qa-leader',name:'Preview Vice Principal',role:'vice_principal',photo_url:null}
const mentor = {id:'qa-mentor',name:'Preview mentor',role:'usthad',photo_url:null,student_count:8,place:'Preview'}
const reports = students.map((s,i)=>({...s,totalPoints:100-i,bonusPoints:0}))
const cookie = `preview.${Buffer.from(JSON.stringify({role:'vice_principal'})).toString('base64')}.not-a-real-signature`

;(async()=>{
 const browser = await chromium.launch({channel:'chrome',headless:true})
 try {
  for(const device of [{name:'tablet',width:1024,height:768,touch:true},{name:'phone',width:390,height:844,touch:true},{name:'laptop',width:1440,height:1000,touch:false}]) {
   const context = await browser.newContext({viewport:{width:device.width,height:device.height},isMobile:device.touch,hasTouch:device.touch})
   await context.addCookies([{name:'auth_token',value:cookie,url:origin,httpOnly:true}])
   const page = await context.newPage(), errors=[], requests=[]
   page.on('pageerror',error=>errors.push(error.message))
   await page.route('**/api/**',route=>{
    const request=route.request(),url=new URL(request.url());requests.push(url.pathname)
    let body={success:true}
    if(url.pathname.endsWith('/auth/me'))body.user=leader
    else if(url.pathname.endsWith('/staff/me'))body.staff=request.headers()['x-delegation-token']?mentor:leader
    else if(url.pathname.endsWith('/dashboard/admin'))body.summary={students:{active:45,on_campus:42,out_campus:3},staff:{active:8}}
    else if(url.pathname.endsWith('/daily-stats'))body.students={present:40,total:45}
    else if(url.pathname.endsWith('/focusable-mentors'))body.mentors=[mentor]
    else if(url.pathname.endsWith('/supervisor-focus'))Object.assign(body,{delegationToken:'preview-focus-token',mentor})
    else if(url.pathname.endsWith('/dashboard/staff'))body.summary={profile:mentor,students:students.slice(0,8),schedules:[],monthly_report:reports.slice(0,8)}
    else if(url.pathname.endsWith('/students'))body.students=students
    else if(url.pathname.endsWith('/calculate'))body.reports=reports
    else if(url.pathname.endsWith('/incidents'))body.incidents=[]
    else if(url.pathname.endsWith('/mentor-policies'))body.policies=[]
    else if(url.pathname.endsWith('/years'))body.years=[]
    return route.fulfill({json:body})
   })
   await page.goto(origin+'/staff')
   await page.waitForURL('**/leadership')
   await page.getByRole('heading',{name:/Good .*Preview Vice Principal/}).waitFor()
   assert.equal(await page.locator('[data-portal="leadership"]').count(),1)
   assert.equal(requests.filter(p=>p.endsWith('/dashboard/staff')).length,0,'overview never loads mentor dashboard')
   assert.equal(requests.filter(p=>p.endsWith('/staff/me')).length,0,'overview uses real leader identity')
   const hero=page.locator('.leadership-welcome')
   const before=await hero.boundingBox()
   for(let i=0;i<8;i++) {await page.evaluate(i=>window.scrollTo(0,i%2?0:120),i);await page.waitForTimeout(40)}
   await page.evaluate(()=>window.scrollTo(0,0))
   assert.equal(await hero.evaluate(el=>getComputedStyle(el).transform),'none')
   const trophy=page.getByRole('button',{name:'Open top performers',exact:true})
   if(device.touch)await trophy.tap();else await trophy.click()
   const panel=page.getByRole('dialog',{name:'Top Performers',exact:true});await panel.waitFor()
   await panel.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))))
   const paint=await panel.evaluate(el=>{const s=getComputedStyle(el);return {transform:s.transform,filter:s.filter,backdrop:s.backdropFilter,animation:s.animationName,background:s.backgroundColor}})
   assert.equal(paint.transform,'none');assert.equal(paint.filter,'none');assert.equal(paint.backdrop,'none')
   assert.equal(paint.animation,'leadership-appear')
   for(let i=0;i<15;i++) {await panel.locator('.overflow-y-auto').evaluate((el,i)=>el.scrollTop=i%2?0:el.scrollHeight,i);await page.waitForTimeout(30);assert.equal((await hero.boundingBox()).height,before.height)}
   await panel.locator('.overflow-y-auto').evaluate(el=>el.scrollTop=0)
   const month=panel.getByRole('combobox',{name:'Leaderboard month',exact:true});if(device.touch)await month.tap();else await month.click()
   await page.getByRole('listbox').waitFor();await page.waitForTimeout(500)
   assert.match(await page.getByRole('listbox').evaluate(el=>getComputedStyle(el).backdropFilter),/blur/)
   await page.keyboard.press('Escape');await page.getByRole('listbox').waitFor({state:'hidden'})
   await page.getByRole('button',{name:'Close leaderboard',exact:true}).click();await panel.waitFor({state:'hidden'})
   const focus=page.getByRole('button',{name:/Preview mentor/}).first();await focus.click()
   await page.waitForURL('**/leadership/mentor')
   await page.getByRole('heading',{name:/Good .*Preview mentor/}).waitFor()
   assert.equal(await page.locator('[data-portal="leadership"]').count(),1)
   assert.equal(await page.getByText('Mentor Portal',{exact:true}).count(),0)
   await page.getByRole('link',{name:'Exit focus',exact:true}).click();await page.waitForURL('**/leadership')
   await page.getByRole('heading',{name:/Good .*Preview Vice Principal/}).waitFor()
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('delegationToken')),null)
   await page.getByRole('link',{name:'Discipline',exact:true}).click();await page.waitForURL('**/leadership/disciplinary')
   await page.getByRole('heading',{name:'Disciplinary Actions'}).waitFor()
   assert.match(await page.getByRole('link',{name:'Report incident'}).getAttribute('href'),/^\/leadership\//)
   await page.getByRole('link',{name:'Overview',exact:true}).click();await page.getByRole('heading',{name:/Good .*Preview Vice Principal/}).waitFor()
   await page.emulateMedia({reducedMotion:'reduce'});if(device.touch)await trophy.tap();else await trophy.click();await panel.waitFor();assert.equal(await panel.evaluate(el=>getComputedStyle(el).animationName),'none');await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'})
   assert.deepEqual(errors,[])
   console.log(JSON.stringify({device:device.name,passed:'separate shell, no mentor requests on overview, stable untransformed headers, leaderboard, glass picker, focus round-trip, feature links, reduced motion',paint}))
   await context.close()
  }
 } finally { await browser.close() }
})().catch(error=>{console.error(error);process.exit(1)})
