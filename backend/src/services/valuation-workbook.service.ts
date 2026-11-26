import ExcelJS from 'exceljs';

type Student = {student_id:string;student_name:string;standard:string;serial_no:number;center_id:string};
type Subject = {id:string;name:string;standard:string;question_count:number|null;question_max:number|null};
type Valuation = {student_id:string;subject_id:string;marks:(number|null)[];juz:string};
type Center = {id:string;code:string;name:string;examiner_name:string};
export type ValuationWorkbookData = {exam:{title:string};centers:Center[];students:Student[];subjects:Subject[];valuations:Valuation[]};

// A separate printable sheet for each center and distinct question configuration.
export async function createValuationWorkbook(data:ValuationWorkbookData, blank = false) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ribathul Quran';
    workbook.calcProperties.fullCalcOnLoad = true;
    const usedNames = new Set<string>();
    for (const center of data.centers) {
        const students = data.students.filter(s => s.center_id === center.id).sort((a,b) => a.serial_no-b.serial_no);
        const groups = new Map<string,{name:string;count:number;max:number;rows:{student:Student;subject?:Subject}[]}>();
        for (const student of students) {
            const subjects = data.subjects.filter(s => s.standard === student.standard && s.question_count);
            for (const subject of subjects.length ? subjects : [undefined]) {
                const name = subject?.name || 'Unconfigured subject';
                const count = subject?.question_count || 10;
                const max = subject?.question_max || 10;
                const key = JSON.stringify([name,count,max]);
                if (!groups.has(key)) groups.set(key,{name,count,max,rows:[]});
                groups.get(key)!.rows.push({student,subject});
            }
        }
        if (!groups.size) groups.set('empty',{name:'',count:10,max:10,rows:[]});
        let groupIndex = 0;
        for (const group of groups.values()) {
            groupIndex++;
            const baseName = `Center ${center.code}${groups.size>1 ? ` - ${groupIndex}` : ''}`.replace(/[\\/*?:\[\]]/g,' ').slice(0,27);
            let name = baseName;
            for (let n=2; usedNames.has(name); n++) name = `${baseName}-${n}`;
            usedNames.add(name);
            const sheet = workbook.addWorksheet(name,{views:[{state:'frozen',xSplit:5,ySplit:3,showGridLines:false}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.25,right:0.25,top:0.3,bottom:0.3,header:0.1,footer:0.1}}});
            const last = group.count+6;
            sheet.columns = [3.5,11,33,18,9,...Array(group.count).fill(6.5),10].map(width=>({width}));
            sheet.mergeCells(1,1,1,last);
            sheet.getCell(1,1).value = data.exam.title;
            sheet.mergeCells(2,1,2,last);
            sheet.getCell(2,1).value = `EXAM VALUATION SHEET – ${center.name.toUpperCase()}${groups.size>1 ? ` · ${group.name} (${group.count} × ${group.max})` : ''}`;
            sheet.getRow(1).height = 28;
            sheet.getRow(2).height = 25;
            sheet.getRow(3).values = ['NO','ROLL NO','NAME','CLASS / STANDARD','JUZ',...Array.from({length:group.count},(_,i)=>i+1),'TOTAL'];
            sheet.getRow(3).height = 28;
            group.rows.forEach(({student,subject},index)=>{
                const rowNo = index+4;
                const value = !blank && subject ? data.valuations.find(v=>v.student_id===student.student_id && v.subject_id===subject.id) : undefined;
                const marks = Array.from({length:group.count},(_,i)=>value?.marks[i] ?? null);
                const row = sheet.getRow(rowNo);
                row.values = [student.serial_no,student.student_id,student.student_name,student.standard,value?.juz || null,...marks];
                row.height = 29;
                const start = sheet.getCell(rowNo,6).address;
                const end = sheet.getCell(rowNo,last-1).address;
                const total = marks.every(m=>m===null) ? '' : Number(marks.reduce<number>((sum,m)=>sum+(m??0),0).toFixed(10));
                row.getCell(last).value = {formula:`IF(COUNT(${start}:${end})=0,"",SUM(${start}:${end}))`,result:total};
                for(let column=6;column<last;column++) row.getCell(column).dataValidation = {type:'decimal',operator:'between',formulae:[0,group.max],allowBlank:true,showErrorMessage:true,errorStyle:'stop',errorTitle:'Invalid mark',error:`Enter a mark from 0 to ${group.max}. Decimals are allowed.`};
            });
            const footer = group.rows.length+4;
            const split = Math.ceil(last*0.63);
            sheet.mergeCells(footer,1,footer,split);
            sheet.mergeCells(footer,split+1,footer,last);
            sheet.getCell(footer,1).value = `Invigilator: ${center.examiner_name || ''}`;
            sheet.getCell(footer,split+1).value = 'Sign:';
            sheet.getRow(footer).height = 27;
            for(let r=1;r<=footer;r++) for(let c=1;c<=last;c++) {
                const cell = sheet.getCell(r,c);
                cell.font = {name:'Arial',size:r===1?14:r===2?11:10,bold:r<=3,color:{argb:r>3 && r<footer && c<=5?'FF003399':'FF000000'}};
                cell.alignment = {vertical:'middle',horizontal:r>3 && r<footer && c===3?'left':'center',wrapText:true};
                cell.border = {top:{style:'thin',color:{argb:'FF000000'}},bottom:{style:'thin',color:{argb:'FF000000'}},left:{style:'thin',color:{argb:'FF000000'}},right:{style:'thin',color:{argb:'FF000000'}}};
                if(r>3 && r<footer && c>=6) cell.numFmt = 'General';
            }
            sheet.pageSetup.printTitlesRow = '1:3';
            sheet.pageSetup.printArea = `A1:${sheet.getCell(footer,last).address}`;
        }
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
}
