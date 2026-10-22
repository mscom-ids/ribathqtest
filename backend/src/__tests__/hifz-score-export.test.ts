import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { exportMonthlyReportExcel, exportMonthlyReportPdf } from '../controllers/hifz-export.controller';

async function main() {
 const req:any={body:{month:'2026-10',rows:[{adm_no:'TEST',name:'Bonus Student',standard:'6th',hifz_pages:21,recent_days:14,juz_revision:10,point_days:20,base_points:100,bonus_points:5.15,total_points:105.15,grade:'O',attendance:'Present',usthad_name:'Mentor'}]}};
 let buffer:Buffer|undefined;let status=200;
 const res:any={setHeader(){},send(value:Buffer){buffer=value;return this},status(value:number){status=value;return this},json(value:any){throw new Error(JSON.stringify(value))}};
 await exportMonthlyReportExcel(req,res);
 assert.equal(status,200);assert.ok(buffer);
 const workbook=XLSX.read(buffer,{type:'buffer'});
 const sheet=workbook.Sheets['Monthly Report'];
 const values=XLSX.utils.sheet_to_json<any[]>(sheet,{header:1});
 assert.equal(values[4].length,14);assert.equal(values[5].length,14);
 assert.deepEqual(values[4].slice(8,12),['Base Points','Bonus Points','Total Points','Grade']);
 assert.deepEqual(values[5].slice(8,12),[100,5.15,105.15,'O']);
 assert.equal(sheet['!autofilter']?.ref,'A5:N6');
 buffer=undefined;
 await exportMonthlyReportPdf(req,res);
 assert.ok(buffer);
 const pdf=(buffer as Buffer).toString('latin1');
 assert.match(pdf,/\(105\.15\) Tj/);assert.match(pdf,/\(5\.15\) Tj/);assert.match(pdf,/\(O\) Tj/);
 // Landscape A4, 30pt margin: the table must end within the page.
 const verticals=[...pdf.matchAll(/([\d.]+) [\d.]+ m ([\d.]+) [\d.]+ l S/g)].map(match=>Number(match[1]));
 assert.ok(verticals.length>0);assert.ok(Math.max(...verticals)<=812);
 console.log('Monthly score exports passed: base/bonus/total/Outstanding grade retained; PDF columns fit the page.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
