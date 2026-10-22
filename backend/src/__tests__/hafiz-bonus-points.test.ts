import assert from 'node:assert/strict';
import { calculateHifzReportPoints, HifzLog } from '../utils/hifz-calculator';

const options={isHafiz:true,expectedClassDaysOverride:20,attendedClasses:40,countedClasses:40};
function logs(newJuz:number,oldJuz:number):HifzLog[]{
 const rows:HifzLog[]=[];
 for(const [mode,total] of [['Juz Revision (New)',newJuz],['Juz Revision (Old)',oldJuz]] as const)
  for(let q=0;q<total*4;q++)rows.push({mode,entry_date:'2026-10-01',juz_number:1,juz_portion:'Q1'});
 return rows;
}
const score=(newJuz:number,oldJuz:number)=>calculateHifzReportPoints(logs(newJuz,oldJuz),[],options);
const full=score(6,15);
assert.equal(full.newRevisionTarget,6);assert.equal(full.oldRevisionTarget,15);
assert.equal(full.newRevisionPoints,40);assert.equal(full.oldRevisionPoints,30);
assert.equal(full.attendancePoints,30);assert.equal(full.basePoints,100);assert.equal(full.totalMax,100);
assert.equal(full.bonusPoints,0);assert.equal(full.totalPoints,100);assert.equal(full.grade,'A++');
for(const [extra,bonus] of [[0.25,1.67],[0.5,3.33],[1,6.67]] as const)assert.equal(score(6+extra,15).bonusPoints,bonus,'extra New Juz earns 40/(D*0.3) per Juz');
for(const [extra,bonus] of [[0.25,0.5],[0.5,1],[1,2]] as const)assert.equal(score(6,15+extra).bonusPoints,bonus,'extra Old Juz earns 30/(D*0.75) per Juz');
assert.equal(score(6.5,15.25).bonusPoints,3.83,'combined excess uses each component rate, then rounds once');
assert.equal(calculateHifzReportPoints(logs(3.25,7.5),[],{...options,expectedClassDaysOverride:10}).bonusPoints,3.33,'different monthly D changes the rate for the same extra quarter New Juz');
assert.equal(score(6.25,15).grade,'O');assert.equal(score(100,100).totalPoints,120);
assert.equal(score(100,14.75).bonusPoints,0,'both components must reach full targets');
assert.equal(score(5.75,100).bonusPoints,0,'extra Old cannot compensate for incomplete New');
const below=calculateHifzReportPoints(logs(6,15),[],{...options,expectedClassDaysOverride:20.001});
assert.equal(below.newRevisionPoints,40);assert.equal(below.oldRevisionPoints,30);assert.equal(below.bonusEligible,false,'rounded full marks cannot unlock before actual targets');
const late=calculateHifzReportPoints(logs(6,15),[],{...options,attendedClasses:20});assert.equal(late.attendancePoints,15);assert.equal(late.totalPoints,85);assert.equal(late.grade,'A');
const noAttendance=calculateHifzReportPoints(logs(100,100),[],{...options,attendedClasses:0});assert.equal(noAttendance.bonusPoints,20);assert.equal(noAttendance.totalPoints,90);assert.equal(noAttendance.grade,'A+','bonus alone does not guarantee Outstanding');
const zero=calculateHifzReportPoints(logs(100,100),[],{...options,expectedClassDaysOverride:0});assert.equal(zero.bonusPoints,0);assert.equal(zero.totalPoints,30);assert.equal(zero.totalMax,100);
const plain=calculateHifzReportPoints([{mode:'Juz Revision',entry_date:'2026-10-01',juz_portion:'Full'}],[],{...options,attendedClasses:0});assert.equal(plain.juzPoints,0,'legacy plain Juz cannot inflate Hafiz New/Old scores');
console.log('Hafiz scoring passed: 40/30/30, independent caps, both-target gate, proportional quarter/half/full bonus, combined cap20, raw grades, zero days.');
