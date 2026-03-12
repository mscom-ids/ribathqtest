import fs from 'fs';
const path = 'D:/NewRQP/src/components/staff/daily-entry-form.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Fix date input disabling property
content = content.replace(/<Input type="date" \{\.\.\.field\} disabled=\{isOldDate\} className="bg-\[#1e1e1e\] border-gray-700" \/>/g, 
                          '<Input type="date" {...field} className="bg-[#1e1e1e] border-gray-700" />');

// 2. Fix schema validation condition
content = content.replace(/if \(data\.mode === "New Verses"\)/, 'if (data.mode === "New Verses" || data.mode === "Recent Revision")');

// 3. Remove start_page/end_page validation
const pageValidationOld = `    } else if (data.mode === "Recent Revision") {
        if (!data.start_page) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Start page is required", path: ["start_page"] })
        if (!data.end_page) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "End page is required", path: ["end_page"] })
        if (data.start_page && data.end_page && data.start_page > data.end_page) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "End page must be >= start page", path: ["end_page"] })
        }
    } else if (data.mode === "Juz Revision") {`;
content = content.replace(pageValidationOld, '    } else if (data.mode === "Juz Revision") {');

// 4. Update onSubmit condition
content = content.replace(/if \(values\.mode === "New Verses"\)/, 'if (values.mode === "New Verses" || values.mode === "Recent Revision")');

// 5. Update singleData in onSubmit
const singleDataOld = `                const singleData = {
                    ...commonData,
                    surah_name: null, start_v: null, end_v: null,
                    start_page: values.mode === "Recent Revision" ? values.start_page : null,
                    end_page: values.mode === "Recent Revision" ? values.end_page : null,
                    juz_number: values.mode === "Juz Revision" ? values.juz_number : null,
                    juz_portion: values.mode === "Juz Revision" ? values.juz_portion : null,
                }`;
const singleDataNew = `                const singleData = {
                    ...commonData,
                    surah_name: null, start_v: null, end_v: null,
                    start_page: null, end_page: null,
                    juz_number: values.mode === "Juz Revision" ? values.juz_number : null,
                    juz_portion: values.mode === "Juz Revision" ? values.juz_portion : null,
                }`;
content = content.replace(singleDataOld, singleDataNew);

// 6. Fix Dropdown label
content = content.replace(/<SelectItem value="Recent Revision">Recent Revision \(Sabaq Para\)<\/SelectItem>/, 
                          '<SelectItem value="Recent Revision">Recent Revision</SelectItem>');

// 7. Render UI sections: Use new_verses for Recent Revision
content = content.replace(/\{form\.watch\("mode"\) === "New Verses" && \(/, 
                          '{(form.watch("mode") === "New Verses" || form.watch("mode") === "Recent Revision") && (');

// 8. Remove UI section for Recent Revision mode fully
const recentUiStart = content.indexOf('{/* Recent Revision Mode - Page Based */}');
const juzUiStart = content.indexOf('{/* Juz Revision Mode */}');
if (recentUiStart !== -1 && juzUiStart !== -1) {
    const stringToRemove = content.substring(recentUiStart, juzUiStart);
    content = content.replace(stringToRemove, '');
}

// 9. Add warning text for isOldDate above the submit button
const buttonPattern = `<Button type="submit" disabled={loading || isOldDate} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12 shadow-lg shadow-emerald-950">`;
if (content.includes(buttonPattern)) {
    content = content.replace(buttonPattern, 
        `{isOldDate && <p className="text-red-400 text-xs text-center mb-2">Notice: Data entry is locked for dates older than 7 days.</p>}\n                                ` + buttonPattern);
}

fs.writeFileSync(path, content);
console.log("Refactored daily-entry-form successfully!");
