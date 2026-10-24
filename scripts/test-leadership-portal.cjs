// Run against a separate local Next dev server. Every API request is mocked;
// the fake cookie exercises only the Next routing guard, never backend auth.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/swabe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const assert = require('node:assert/strict')
const origin = process.env.LEADERSHIP_TEST_ORIGIN || 'http://localhost:3020'
assert(['localhost','127.0.0.1'].includes(new URL(origin).hostname),'Tests must only target a local isolated server')
const students = Array.from({length:45},(_,i)=>({adm_no:`QA${i}`,name:`Preview student ${i+1}`,standard:'7th',photo_url:null,progress:0}))
const leader = {id:'qa-leader',name:'Preview Vice Principal',role:'vice_principal',photo_url:null}
const mentor = {id:'qa-mentor',name:'Preview mentor',role:'usthad',is_active:true,photo_url:null,student_count:8,place:'Preview'}
const reports = students.map((s,i)=>({...s,totalPoints:i<3?90:i===44?0:90-i,bonusPoints:i<3?20:0}))
const outside = students.slice(0,3).map((student,i)=>({adm_no:student.adm_no,student_name:student.name,standard:student.standard,leave_type:i===0?'institutional':'personal',institutional_leave_name:i===0?'Preview programme':null,actual_exit_datetime:'2026-10-22T04:00:00Z',end_datetime:'2026-10-23T12:00:00Z',hifz_mentor_name:mentor.name}))
const cookie = `preview.${Buffer.from(JSON.stringify({role:'vice_principal'})).toString('base64')}.not-a-real-signature`

;(async()=>{
 const browser = await chromium.launch({channel:'chrome',headless:true})
 try {
  for(const device of [{name:'tablet',width:834,height:1112,touch:true},{name:'ipad-landscape',width:1194,height:834,touch:true},{name:'phone',width:390,height:844,touch:true},{name:'compact-phone',width:320,height:740,touch:true},{name:'laptop',width:1440,height:1000,touch:false}]) {
   const context = await browser.newContext({viewport:{width:device.width,height:device.height},isMobile:device.touch,hasTouch:device.touch})
   await context.addCookies([{name:'auth_token',value:cookie,url:origin,httpOnly:true}])
   const page = await context.newPage(), errors=[], requests=[]
   page.setDefaultNavigationTimeout(120_000)
   let outsideMode='full'
   page.on('pageerror',error=>errors.push(error.message))
   await page.route('**/api/**',route=>{
    const request=route.request(),url=new URL(request.url());requests.push(url.pathname)
    let body={success:true}
    if(url.pathname.endsWith('/auth/me'))body.user=leader
    else if(url.pathname.endsWith('/outside-students')) {
      if(outsideMode==='error')return route.fulfill({status:500,json:{success:false}})
      body.students=outsideMode==='empty'?[]:outsideMode==='long'?students.map(s=>({...outside[0],adm_no:s.adm_no,student_name:s.name})):[...outside,outside[0]]
    }
    else if(url.pathname.endsWith('/staff/me'))body.staff=request.headers()['x-delegation-token']?mentor:leader
    else if(url.pathname.endsWith('/dashboard/admin'))body.summary={students:{active:45,on_campus:42,out_campus:3},staff:{active:8}}
    else if(url.pathname.endsWith('/daily-stats'))body.students={present:40,total:45}
    else if(url.pathname==='/api/staff')body.staff=[mentor]
    else if(url.pathname.endsWith('/supervisor-focus'))Object.assign(body,{delegationToken:'preview-focus-token',mentor})
    else if(url.pathname.endsWith('/dashboard/staff'))body.summary={profile:mentor,students:students.slice(0,8),schedules:[],monthly_report:reports.slice(0,8)}
    else if(url.pathname.endsWith('/students'))body.students=students
    else if(url.pathname.endsWith('/calculate'))body.reports=url.searchParams.get('mentor_id')==='qa-mentor'?reports.slice(0,8):reports
    else if(url.pathname.endsWith('/incidents'))body.incidents=[]
    else if(url.pathname.endsWith('/mentor-policies'))body.policies=[]
    else if(url.pathname.endsWith('/years'))body.years=[]
    return route.fulfill({json:body})
   })
   await page.goto(origin+'/staff')
   await page.waitForURL('**/leadership')
   // Next's development-only badge overlaps the first phone navigation target.
   // Hide only that debugging surface; runtime page errors are still collected.
   await page.addStyleTag({content:'nextjs-portal { display: none !important; }'})
   await page.getByRole('heading',{name:'Institution overview',exact:true}).waitFor()
   assert.equal(await page.locator('[data-portal="leadership"]').count(),1)
   assert.equal(requests.filter(p=>p.endsWith('/dashboard/staff')).length,0,'overview never loads mentor dashboard')
   assert.equal(requests.filter(p=>p.endsWith('/staff/me')).length,0,'overview uses real leader identity')
   const mobile=device.width<768
   const bottomNav=page.getByRole('navigation',{name:'Leadership mobile navigation',exact:true})
   const desktopNav=page.getByRole('navigation',{name:'Leadership navigation',exact:true})
   assert.equal(await bottomNav.isVisible(),mobile);assert.equal(await desktopNav.isVisible(),!mobile)
   if(!mobile){assert.equal(await desktopNav.evaluate(el=>getComputedStyle(el).scrollbarWidth),'none','scrollbar hidden without disabling scrolling');assert.equal(await desktopNav.evaluate(el=>getComputedStyle(el).overflowX),'auto');const active=desktopNav.locator('[aria-current="page"]');assert.equal(await active.evaluate(el=>getComputedStyle(el).color),'rgb(37, 99, 235)','active link has the light blue treatment')}
   const progressButton=page.getByRole('button',{name:'Open progress for Preview student 1',exact:true})
   assert.equal(await progressButton.evaluate(el=>getComputedStyle(el).color),'rgb(37, 99, 235)','progress button uses the same soft blue treatment')
   if(!mobile){const header=await page.locator('.leadership-header-grid').boundingBox();const nav=await desktopNav.boundingBox();assert(nav.y<header.y+30,'navigation shares header row on tablets and desktops');await desktopNav.evaluate(el=>{el.scrollLeft=el.scrollWidth});assert(await desktopNav.getByRole('link',{name:'Finance',exact:true}).isVisible());await desktopNav.evaluate(el=>el.scrollLeft=0)}
   assert.equal(await page.getByText('Mentor Focus',{exact:true}).count(),0)
   assert.equal(await page.getByRole('navigation',{name:'Leadership quick actions',exact:true}).count(),0)
   assert.equal(await page.getByText('Your daily workspace',{exact:true}).count(),0)
   await page.getByRole('combobox',{name:'Filter students by class',exact:true}).selectOption('7th')
   await page.getByRole('combobox',{name:'Filter students by class',exact:true}).selectOption('all')
   if(mobile){const rect=await bottomNav.boundingBox();assert(Math.abs(rect.y+rect.height-device.height)<2,'mobile menu is at bottom');assert(await page.locator('.leadership-portal main').first().evaluate(el=>parseFloat(getComputedStyle(el).paddingBottom))>=100)}
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'no horizontal page overflow')
   await page.evaluate(()=>window.scrollTo(0,0))
   if(process.env.LEADERSHIP_SCREENSHOTS==='1')await page.screenshot({path:`tmp/leadership-premium-${device.name}.png`})
   assert.equal(requests.filter(p=>p.endsWith('/outside-students')).length,0,'outside list loads only when opened')
   const outsideTrigger=page.getByRole('button',{name:'View outside students',exact:true})
   if(device.touch)await outsideTrigger.tap();else await outsideTrigger.click()
   const outsidePanel=page.getByRole('dialog',{name:'Students outside',exact:true});await outsidePanel.waitFor()
   await outsidePanel.getByText('3 students currently outside',{exact:true}).waitFor()
   assert.equal(await outsidePanel.getByRole('link').count(),3,'duplicate leave rows do not duplicate people')
   const search=outsidePanel.getByRole('textbox',{name:'Search outside students'})
   assert(!await search.evaluate(el=>el===document.activeElement),'opening the list does not summon the mobile keyboard')
   await search.fill('QA1');assert.equal(await outsidePanel.getByRole('link').count(),1)
   await search.fill('not-a-student');await outsidePanel.getByText('No students match your search.',{exact:true}).waitFor()
   await search.fill('7th');assert.equal(await outsidePanel.getByRole('link').count(),3);await search.fill('')
   await outsidePanel.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))))
   // Popper recomputes collisions on the frame after filtered content grows.
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
   const outsideBounds=await outsidePanel.boundingBox();assert(outsideBounds.x>=10&&outsideBounds.x+outsideBounds.width<=device.width-10&&outsideBounds.y>=0&&outsideBounds.y+outsideBounds.height<=device.height+1,'anchored popup fits viewport')
   if(process.env.LEADERSHIP_SCREENSHOTS==='1')await page.screenshot({path:`tmp/leadership-outside-${device.name}.png`})
   await page.keyboard.press('Escape');await outsidePanel.waitFor({state:'hidden'});assert(await outsideTrigger.evaluate(el=>el===document.activeElement))
   if(device.name==='phone') {
     outsideMode='error';await page.getByRole('button',{name:'View currently outside students',exact:true}).tap();await outsidePanel.getByRole('alert').waitFor()
     outsideMode='empty';await outsidePanel.getByRole('button',{name:'Retry',exact:true}).click();await outsidePanel.getByText('No students are currently listed as outside.',{exact:true}).waitFor();await page.keyboard.press('Escape');await outsidePanel.waitFor({state:'hidden'})
     outsideMode='long';await outsideTrigger.tap();await outsidePanel.getByText('45 students currently outside',{exact:true}).waitFor();assert(await outsidePanel.locator('.overflow-y-auto').evaluate(el=>el.scrollHeight>el.clientHeight),'long list scrolls within popup');await page.keyboard.press('Escape');await outsidePanel.waitFor({state:'hidden'});outsideMode='full'
   }
   const hero=page.locator('.leadership-welcome')
   await page.evaluate(()=>document.fonts.ready)
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
   await trophy.click();await panel.waitFor()
   const mentorFilter=panel.getByRole('combobox',{name:'Leaderboard mentor',exact:true})
   await panel.getByText('45 students',{exact:true}).waitFor()
   assert.equal(await panel.locator('[data-student-id]').count(),45,'each student appears once, including zero-point students')
   const leaders=panel.getByRole('group',{name:'Leading students'})
   assert.equal(await leaders.locator('[data-rank="1"]').count(),3,'all three 90-point students are joint first')
   assert.equal(await leaders.locator('.is-first').count(),3,'joint winners receive equal gold styling')
   assert.equal(await panel.locator('.points-place-frame').count(),10,'place frames cover ranks 1 through 10 only')
   assert.equal(await panel.locator('[data-student-id][data-rank="11"] .points-place-frame').count(),0)
   assert((await panel.locator('.points-header-card').boundingBox()).height <= 180,'title and both selectors fit in a compact header card')
   assert.equal(await panel.locator('.points-podium-panel').count(),1,'all leading cards share one podium panel')
   assert.equal(await panel.getByRole('list',{name:'Student point rankings'}).getByRole('listitem').first().locator('button').getAttribute('data-rank'),'4')
   await mentorFilter.click();await page.getByRole('option',{name:'Preview mentor',exact:true}).click()
   await panel.getByText('8 students',{exact:true}).waitFor()
   assert.equal(await panel.locator('[data-student-id]').count(),8)
   if(process.env.LEADERSHIP_SCREENSHOTS==='1')await page.screenshot({path:`tmp/leadership-points-${device.name}.png`})
   await mentorFilter.click();await page.getByRole('option',{name:'All students',exact:true}).click()
   await panel.getByText('45 students',{exact:true}).waitFor()
   await page.getByRole('button',{name:'Close leaderboard',exact:true}).click();await panel.waitFor({state:'hidden'})
   assert.equal(requests.filter(p=>p.endsWith('/supervisor-focus')||p.endsWith('/focusable-mentors')).length,0,'leaderboard filter never enters mentor focus')
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('delegationToken')),null)
   if(mobile){await page.getByRole('button',{name:'More leadership options',exact:true}).tap();const more=page.getByRole('dialog',{name:'More options',exact:true});await more.waitFor();await more.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));assert.equal(await more.evaluate(el=>getComputedStyle(el).opacity),'1');if(process.env.LEADERSHIP_SCREENSHOTS==='1')await page.screenshot({path:`tmp/leadership-menu-${device.name}.png`});await more.getByRole('link',{name:'Discipline',exact:true}).click()}else await desktopNav.getByRole('link',{name:'Discipline',exact:true}).click();await page.waitForURL('**/leadership/disciplinary',{waitUntil:'domcontentloaded',timeout:30_000})
   await page.getByRole('heading',{name:'Disciplinary Actions'}).waitFor()
   assert.match(await page.getByRole('link',{name:'Report incident'}).getAttribute('href'),/^\/leadership\//)
   await page.addStyleTag({content:'nextjs-portal { display: none !important; }'})
   await (mobile?bottomNav:desktopNav).getByRole('link',{name:'Overview',exact:true}).click();await page.getByRole('heading',{name:'Institution overview',exact:true}).waitFor()
   await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>document.documentElement.classList.add('dark'));if(device.touch)await outsideTrigger.tap();else await outsideTrigger.click();await outsidePanel.getByText('3 students currently outside',{exact:true}).waitFor();assert(await outsidePanel.evaluate(el=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');ctx.fillStyle=getComputedStyle(el).backgroundColor;ctx.fillRect(0,0,1,1);const rgba=ctx.getImageData(0,0,1,1).data;return Math.max(...rgba.slice(0,3))<70&&rgba[3]===255}),'dark popup has a dark opaque background');if(process.env.LEADERSHIP_SCREENSHOTS==='1')await page.screenshot({path:`tmp/leadership-outside-${device.name}-dark.png`});await page.keyboard.press('Escape');await outsidePanel.waitFor({state:'hidden'});await page.emulateMedia({reducedMotion:'reduce'});if(device.touch)await trophy.tap();else await trophy.click();await panel.waitFor();assert.equal(await panel.evaluate(el=>getComputedStyle(el).animationName),'none');await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'})
   assert.deepEqual(errors,[])
   console.log(JSON.stringify({device:device.name,passed:'single-row scrollable header, outside popup, mentor-filtered podium/points, zero-point rows, no focus workflow, feature links and reduced motion',paint}))
   await context.close()
  }
 } finally { await browser.close() }
})().catch(error=>{console.error(error);process.exit(1)})
