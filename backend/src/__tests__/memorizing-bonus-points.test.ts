import assert from 'node:assert/strict';
import { calculateHifzReportPoints, HifzLog } from '../utils/hifz-calculator';

const options = {expectedClassDaysOverride:20,attendedClasses:40,countedClasses:40,firstJuzCompletionDate:'2026-09-01',periodStartDate:'2026-10-01',periodEndDate:'2026-10-31'};
function logs(pages:number,recentDays=14,juz=10): HifzLog[] {
 const rows:HifzLog[] = [{mode:'New Verses',entry_date:'2026-10-01',start_page:1,end_page:pages}];
 for(let day=1;day<=recentDays;day++) rows.push({mode:'Recent Revision',entry_date:`2026-10-${String(day).padStart(2,'0')}`,surah_name:'Al-Fatihah',start_v:1,end_v:7});
 for(let quarter=0;quarter<juz*4;quarter++) rows.push({mode:'Juz Revision',entry_date:'2026-10-01',juz_number:1,juz_portion:'Q1'});
 return rows;
}
const score=(pages:number,recentDays=14,juz=10)=>calculateHifzReportPoints(logs(pages,recentDays,juz),[],options);
const full=score(18);
assert.equal(full.newVersePoints,30);assert.equal(full.recentRevisionPoints,20);assert.equal(full.juzPoints,20);assert.equal(full.attendancePoints,30);
assert.equal(full.totalPoints,100);assert.equal(full.grade,'A++');assert.equal(full.bonusPoints,0);
const extra=score(21);
assert.equal(score(19).bonusPoints,1.67,'one extra page earns the monthly page rate, not a flat20');
assert.equal(score(20).bonusPoints,3.33,'two extra pages earn twice that rate');
assert.equal(calculateHifzReportPoints(logs(10),[],{...options,expectedClassDaysOverride:10}).bonusPoints,3.33,'a different month target changes the per-page rate');
assert.equal(extra.basePoints,100);assert.equal(extra.bonusPoints,5);assert.equal(extra.totalPoints,105);assert.equal(extra.grade,'O');assert.equal(extra.percentage,105);
assert.equal(score(30).totalPoints,120);assert.equal(score(200).totalPoints,120);
assert.equal(score(200,12).bonusPoints,0,'below 90% recent: no bonus even with 200 pages');
assert.equal(score(200,14,8.75).bonusPoints,0,'below 90% Juz: no bonus');
assert.equal(score(21,13,9).bonusPoints,5,'90% Juz and above 90% recent unlock bonus without needing full revision marks');
assert.equal(score(17).bonusEligible,false,'must first reach New Hifz target');
assert.equal(calculateHifzReportPoints(logs(200,13,20),[],{...options,expectedClassDaysOverride:13/(0.7*0.8999)}).bonusPoints,0,'89.99% recent must not unlock even if its displayed score rounds to 18');
assert.equal(calculateHifzReportPoints(logs(200,20,9),[],{...options,expectedClassDaysOverride:20.01}).bonusPoints,0,'Juz below 90% must not unlock');
assert.equal(score(18.006).grade,'O','100.01 is Outstanding; exactly 100 is A++');
const noJuz=calculateHifzReportPoints(logs(200),[],{...options,firstJuzCompletionDate:null});
assert.equal(noJuz.totalMax,80);assert.equal(noJuz.totalPoints,80);assert.equal(noJuz.bonusPoints,0);assert.equal(noJuz.grade,'A');assert.equal(noJuz.percentage,80,'no conversion from smaller maximum');
const transition=calculateHifzReportPoints(logs(21,14,5).map(row=>({...row,entry_date:row.mode==='Recent Revision'?row.entry_date:'2026-10-20'})),[],{...options,firstJuzCompletionDate:'2026-10-10',pointDayWeights:{'2026-10-05':1,'2026-10-20':1}});
assert.equal(transition.juzMax,10);assert.equal(transition.totalMax,90);assert.equal(transition.bonusPoints,5,'transition uses applicable Juz maximum');
const late=calculateHifzReportPoints([],[],{...options,attendedClasses:20});assert.equal(late.attendancePoints,15);
const zero=calculateHifzReportPoints([],[],{...options,expectedClassDaysOverride:0});assert.equal(zero.totalPoints,30);assert.equal(zero.bonusPoints,0);assert.equal(zero.grade,'NO GRADE');
for(const [points,grade] of [[35,'D+'],[40,'C'],[50,'C+'],[60,'B'],[70,'B+'],[80,'A'],[90,'A+'],[95,'A++'],[100,'A++']] as const){
 const result=points>=70
  ? calculateHifzReportPoints(logs(18),[],{...options,attendedClasses:(points-70)/30*40})
  : calculateHifzReportPoints(logs((points-30)/30*18,0,0),[],options);
 assert.equal(result.totalPoints,points); assert.equal(result.grade,grade);
}
const hafizLogs:HifzLog[]=[{mode:'Juz Revision (New)',entry_date:'2026-10-01',juz_portion:'Full'},{mode:'Juz Revision (Old)',entry_date:'2026-10-01',juz_portion:'1st Half'}];
const hafiz=calculateHifzReportPoints(hafizLogs,[],{...options,isHafiz:true});
assert.equal(hafiz.newRevisionPoints,6.67);assert.equal(hafiz.oldRevisionPoints,1);assert.equal(hafiz.attendancePoints,30);assert.equal(hafiz.totalMax,100);assert.equal(hafiz.bonusPoints,0);
console.log('Memorizing scoring passed: 30/20/20/30, 90% gates, per-page excess credit, cap120, raw grades, transition/N/A, zero days.');
