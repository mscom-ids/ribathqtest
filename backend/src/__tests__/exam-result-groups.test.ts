import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { evaluateStudentResult, hifzGrade, type ResultSubject } from '../services/exam-result.service';
import { createResultExportRows } from '../services/exam-result-export.service';
import { exportPortal } from '../controllers/exam-portal.controller';
import { db } from '../config/db';

const student = {student_id:'R101',standard:'8th'};
const combined = 'Hifz Valuation + Hifz Portion';
const subjects: ResultSubject[] = [
    {id:'valuation',name:'Hifz Valuation',standard:'8th',max_marks:80,min_marks:32,question_count:10,result_group:combined,result_group_min_marks:35,result_component_min_marks:24},
    {id:'portion',name:'Hifz Portion',standard:'8th',max_marks:20,min_marks:7,question_count:1,result_group:combined,result_group_min_marks:35},
    {id:'murajaa',name:"Hfz Muraja'a",standard:'8th',max_marks:100,min_marks:35,question_count:1,result_group:"Hifz Muraja'a",result_group_min_marks:35},
];
function marks(values:(number|string|null)[]) {return values.map((total,index)=>({student_id:'R101',subject_id:subjects[index].id,total,status:'submitted'}));}
const result = (values:number[]) => evaluateStudentResult(student,subjects,marks(values));

async function run() {
    for (const [percentage,grade] of [[100,'A++'],[95,'A++'],[94.99,'A+'],[90,'A+'],[89.99,'A'],[80,'A'],[79.99,'B+'],[70,'B+'],[69.99,'B'],[60,'B'],[59.99,'C+'],[50,'C+'],[49.99,'C'],[40,'C'],[39.99,'D+'],[35,'D+'],[34.99,'F'],[25,'F'],[0,'F']] as const) assert.equal(hifzGrade(percentage),grade);
    for (const percentage of [null,NaN,Infinity,-1,101]) assert.equal(hifzGrade(percentage),null);
    assert.equal(result([30,5,35]).grade,'D+');
    assert.equal(result([80,20,80]).grade,'A+','Grade uses percentage out of 200');
    assert.equal(result([80,20,90]).grade,'A++','190/200 is exactly 95%');
    assert.equal(result([80,20,30]).grade,'F','Failed group cannot receive a passing overall grade');
    assert.equal(evaluateStudentResult(student,subjects,marks([80,20,null])).grade,null,'Incomplete results have no grade');
    for (const [values,passed] of [
        [[24,11,35],true], [[26,9,35],true], [[23,12,35],false], [[23.75,20,100],false],
        [[30,5,35],true], [[32,3,35],true], [[29,6,35],true],
        [[28,7,35],true], [[35,0,35],true], [[15,20,35],false], [[34,1,35],true],
        [[20,10,40],false], [[20,20,30],false], [[14.75,20,35.25],false],
        [[15,20,34.75],false], [[80,20,0],false], [[0,0,100],false], [[80,20,100],true],
    ] as const) {
        const actual=result([...values]);
        assert.equal(actual.passed,passed,`${values.join('+')} compensation or boundary error`);
        assert.equal(actual.complete,true);
        assert.equal(actual.max,200);assert.equal(actual.minTotal,70);
        assert.deepEqual(actual.groups.map(group=>group.min),[35,35]);
        assert.deepEqual(actual.groups.map(group=>group.max),[100,100]);
    }
    assert.equal(result([35,0,35]).total,70);
    assert.equal(result([35,0,35]).percentage,35);
    assert.equal(result([20,10,40]).total,70);
    const incomplete = [
        marks([20,15,35]).slice(0,2),
        marks([20,15,null]),
        marks([20,15,35]).map(value=>value.subject_id==='portion'?{...value,status:'draft'}:value),
        [...marks([20,15,35]),marks([20,15,35])[0]],
        marks([20,15,'NaN']),
        marks([81,0,35]),
    ];
    for (const values of incomplete) {const actual=evaluateStudentResult(student,subjects,values);assert.equal(actual.complete,false);assert.equal(actual.passed,false);assert.equal(actual.percentage,null);}
    const strings=evaluateStudentResult(student,subjects,marks(['30','5','35']));assert.equal(strings.passed,true);
    assert.equal(evaluateStudentResult(student,[],[]).passed,false);
    assert.equal(evaluateStudentResult(student,subjects.map(subject=>subject.id==='portion'?{...subject,result_group_min_marks:36}:subject),marks([20,15,35])).complete,false);
    const ungrouped=subjects.map(({result_group,result_group_min_marks,...subject})=>subject);
    assert.equal(evaluateStudentResult(student,ungrouped,marks([15,20,35])).passed,false,'Other exams keep per-subject thresholds');
    assert.equal(evaluateStudentResult(student,ungrouped,marks([32,7,35])).passed,true);
    const original=JSON.stringify({subjects,values:marks([15,20,35])});evaluateStudentResult(student,subjects,marks([15,20,35]));assert.equal(JSON.stringify({subjects,values:marks([15,20,35])}),original,'Evaluation never edits source marks or configuration');

    const rows = subjects.map((subject,index)=>({
        ...subject,student_id:'R101',subject_id:subject.id,subject:subject.name,student_name:'Test Student',
        center:'K',serial_no:1,standard:'8th',status:'submitted',total:[30,5,35][index],
        marks:index===0?[1,2,3,4,5,3,3,3,3,3]:[[5],[35]][index-1],juz:'',remarks:'Original remark',
    }));
    const exported=createResultExportRows(rows);
    assert.deepEqual(exported.map(row=>row.Result),['Pass','Pass','Pass'],'Components share combined result and valuation meets its minimum');
    const insufficientValuation=createResultExportRows(rows.map((row,index)=>({...row,total:[23,12,35][index]})));
    assert.equal(insufficientValuation[0].Result,'Fail');
    assert(insufficientValuation.every(row=>row['Overall Result']==='Fail'&&row['Overall Grade']==='F'));
    assert.deepEqual(exported.map(row=>row['Group Total']),[35,35,35]);
    assert(exported.every(row=>row['Overall Result']==='Pass'&&row['Overall Total']===70));
    assert(exported.every(row=>row['Overall Grade']==='D+'));
    const compensation=createResultExportRows(rows.map((row,index)=>({...row,total:[20,10,40][index]})));
    assert.equal(compensation[0].Result,'Fail');assert.equal(compensation[2].Result,'Pass');
    assert(compensation.every(row=>row['Overall Result']==='Fail'&&row['Overall Total']===70));
    const pending=createResultExportRows(rows.map(row=>row.subject_id==='portion'?{...row,status:'draft'}:row));
    assert.equal(pending[0].Result,'Pending');assert(pending.every(row=>row['Overall Result']==='Pending'));

    // Exercise the actual HTTP export handler with an in-memory database stub.
    // No configured database connection or write is used.
    const originalQuery=db.query;let output:Buffer|undefined;
    try {
        db.query=(async(sql:string)=>sql.startsWith('SELECT * FROM exams')?{rows:[{id:'exam-1',department:'Hifz',portal_slug:'test-exam'}]}:{rows}) as typeof db.query;
        await exportPortal({params:{id:'exam-1'},query:{}} as any,{
            setHeader() {}, send(value:Buffer){output=value;},status(code:number){throw new Error(`Unexpected HTTP error: ${code}`);},json(){throw new Error('Unexpected JSON result');},
        } as any,()=>{});
        assert(output,'Expected an Excel export');
        const workbook=XLSX.read(output,{type:'buffer'});
        const register=XLSX.utils.sheet_to_json<Record<string,unknown>>(workbook.Sheets['Result Register']);
        assert.equal(register.length,3);assert.equal(register[0].Q1,1);
        assert.equal(register[0].Total,30);assert.equal(register[0].Result,'Pass');
        assert.equal(register[0]['Group Total'],35);assert.equal(register[0]['Overall Total'],70);
        assert.equal(register[0]['Overall Result'],'Pass');assert.equal(register[0].Remarks,'Original remark');
        const center=XLSX.utils.sheet_to_json<Record<string,unknown>>(workbook.Sheets['Center K']);
        assert.deepEqual(center,register,'Center export uses the same grouped decision');
    } finally {db.query=originalQuery;}
    console.log('Exam result groups passed: 35/35 boundaries, no compensation, missing/draft handling, legacy thresholds, unchanged source marks, and Excel export.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
