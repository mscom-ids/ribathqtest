import assert from 'node:assert/strict';
import { getStudentAttendanceSummaries } from '../utils/attendance-report';
import { calculateHifzReportPoints } from '../utils/hifz-calculator';

async function main() {
 const students = [{adm_no:'ACCURACY-A',standard:'6th'}, {adm_no:'ACCURACY-B',standard:'6th'}];
 const schedules = [1,2,3].map(day=>({id:`session-${day}`, name:'Hifz Class 1',day_of_week:day,standards:['6th'],group_ids:[],effective_from:'2026-10-01',effective_until:null}));
 const queryable = {query: async (sql:string) => {
  if(sql.includes('FROM attendance_schedules')) return {rows:schedules};
  if(sql.includes('FROM student_attendance_marks')) return {rows:students.flatMap(student=>[
   {student_id:student.adm_no,schedule_id:'session-1',date:'2026-10-05',status:'Present'},
   {student_id:student.adm_no,schedule_id:'session-2',date:'2026-10-06',status:'Late'},
  ])};
  return {rows:[]};
 }};
 const result = await getStudentAttendanceSummaries(queryable,students,'2026-10-05','2026-10-07','hifz','test-accuracy-year');
 for(const student of students){
  const summary=result.get(student.adm_no)!;
  assert.equal(summary.effectiveClasses,3);
  assert.equal(summary.presentClasses,1);
  assert.equal(summary.lateClasses,1);
  assert.equal(summary.attendedClasses,2,'late remains attended');
  assert.equal(summary.pendingClasses,1,'an unsubmitted class is unconfirmed, not absent');
  assert.equal(summary.notAttendedClasses,0);
  assert.equal(summary.weightedAttendedClasses,1.5,'Present=1, Late=half');
  assert.equal(summary.sessions.reduce((n,s)=>n+s.pending,0),1);
  assert.match(summary.attendanceLabel,/1 late/);
  assert.match(summary.attendanceLabel,/1 unconfirmed/);
  const points=calculateHifzReportPoints([],[],{expectedClassDaysOverride:3,attendedClasses:summary.weightedAttendedClasses,countedClasses:summary.effectiveClasses});
  assert.equal(points.attendancePoints,15,'pending stays in the denominator and late earns half');
 }
 assert.deepEqual(result.get('ACCURACY-A'),result.get('ACCURACY-B'),'identical schedules and marks produce identical counts');
 const sameAttendance = {expectedClassDaysOverride:20,attendedClasses:1,countedClasses:60,periodStartDate:'2026-10-01',periodEndDate:'2026-10-31'};
 const beforeJuz = calculateHifzReportPoints([],[],{...sameAttendance,firstJuzCompletionDate:null});
 const afterJuz = calculateHifzReportPoints([],[],{...sameAttendance,firstJuzCompletionDate:'2026-09-01'});
 assert.equal(beforeJuz.totalMax,80);
 assert.equal(afterJuz.totalMax,100);
 assert.equal(beforeJuz.totalPoints,0.5);
 assert.equal(afterJuz.totalPoints,0.5,'different applicable maxima must not change earned attendance points');
 console.log('Attendance accuracy passed: late shown separately, pending not absent, fixed denominator, equal inputs/equal points.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
