// Render the real report components with mock data. No server, database, or network calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
const modules = new Map();
function loadSource(filename) {
    filename = path.resolve(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, {
        fileName: filename,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const nativeRequire = createRequire(filename);
    const localRequire = specifier => {
        if (specifier.startsWith('@/')) return loadSource(path.join(root, 'src', specifier.slice(2)) + '.ts');
        if (specifier.startsWith('.')) {
            const target = path.resolve(path.dirname(filename), specifier);
            for (const extension of ['', '.ts', '.tsx']) {
                if (/\.tsx?$/.test(target + extension) && fs.existsSync(target + extension)) return loadSource(target + extension);
            }
        }
        return nativeRequire(specifier);
    };
    vm.runInNewContext(compiled, { module, exports: module.exports, require: localRequire, console }, { filename });
    return module.exports;
}
const { default: PortalReports } = loadSource(path.join(root, 'src/components/exams/portal-reports.tsx'));
const { studentResult, subjectPassLabel } = loadSource(path.join(root, 'src/lib/exam-portal.ts'));
const plain = markup => markup.replace(/<[^>]*>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const articles = markup => [...markup.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)].map(match => match[1]);
const rows = markup => [...markup.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(match => plain(match[1]));
const groupName = 'Hifz Valuation + Hifz Portion';
const commonSubject = { standard: '8th', question_count: 1, question_max: 100 };
const subjects = [
    { ...commonSubject, id: 'valuation', name: 'Hifz Valuation', max_marks: 80, min_marks: 32, result_component_min_marks: 30, question_count: 10, question_max: 8, result_group: groupName, result_group_min_marks: 35 },
    { ...commonSubject, id: 'portion', name: 'Hifz Portion', max_marks: 20, min_marks: 7, question_max: 20, result_group: groupName, result_group_min_marks: 35 },
    { ...commonSubject, id: 'murajaa', name: "Hfz Muraja'a", max_marks: 100, min_marks: 35, result_group: "Hifz Muraja'a", result_group_min_marks: 35 },
];
const scenarios = [
    { id: 'R001', name: 'Combined Thirty', marks: [20, 10, 40], combined: 30, recitation: 40, total: 70, passed: false },
    { id: 'R002', name: 'Recitation Thirty', marks: [30, 10, 30], combined: 40, recitation: 30, total: 70, passed: false },
    { id: 'R003', name: 'Exact Boundary', marks: [30, 5, 35], combined: 35, recitation: 35, total: 70, passed: true },
    { id: 'R004', name: 'Recitation Zero', marks: [60, 20, 0], combined: 80, recitation: 0, total: 80, passed: false },
    { id: 'R005', name: 'Missing Recitation', marks: [30, 5, null], combined: 35, recitation: null, total: null, passed: false },
    { id: 'R006', name: 'Portion Three', marks: [32, 3, 35], combined: 35, recitation: 35, total: 70, passed: true },
    { id: 'R007', name: 'Valuation Below Thirty', marks: [29, 6, 35], combined: 35, recitation: 35, total: 70, passed: false },
];
const students = scenarios.map((s, i) => ({ student_id: s.id, student_name: s.name, standard: '8th', serial_no: i + 1, center_id: 'center-k' }));
const valuations = scenarios.flatMap(s => s.marks.map((total, i) => ({
    student_id: s.id, subject_id: subjects[i].id, total, status: 'submitted', marks: [total],
    juz: '', remarks: '', examiner_name: 'Test Examiner', submitted_at: '2026-11-26T10:00:00Z', version: 1,
})));
const data = {
    exam: { id: 'mock-exam', title: 'Mock Hifz Exam', portal_slug: 'mock-hifz', portal_enabled: true, is_active: true },
    centers: [{ id: 'center-k', code: 'K', name: 'Exam Center K', examiner_name: 'Test Examiner', locked: false, has_passcode: true }],
    students, subjects, valuations, audit: [],
};
const render = (mode, overrides = {}, filters = {}) => renderToStaticMarkup(React.createElement(PortalReports, { data: { ...data, ...overrides }, center: '', standard: '', search: '', mode, ...filters }));

const individual = render('individual');
const cards = articles(individual);
assert.equal(cards.length, scenarios.length);
for (const [i, scenario] of scenarios.entries()) {
    const student = students[i];
    const result = studentResult(student, subjects, valuations);
    assert.equal(result.passed, scenario.passed, `${scenario.name}: live helper agrees with rendered result`);
    assert.equal(result.complete, scenario.total !== null);
    const cardText = plain(cards[i]);
    if (scenario.total !== null) assert(cardText.includes(`Overall grade: ${scenario.passed ? 'D+' : 'F'}`));
    else assert(!cardText.includes('Overall grade:'));
    const cardRows = rows(cards[i]);
    assert(cardText.includes('Pass requirements — every group must pass'));
    assert(cardText.includes('Minimum total: 70 / 200.'));
    assert(cardText.includes('Higher marks in one group cannot make up for marks below the minimum in another.'));
    assert.equal(cardRows.length, 3, 'Only two result rows, plus their header');
    assert(cardRows[1].includes('Hifz Valuation + Hifz Portion'));
    assert(cardRows[1].includes(`${scenario.combined} / 100`));
    assert(cardRows[1].includes('Hifz Valuation minimum: 30 / 80'));
    assert(!cardRows.some(row => row.startsWith('Hifz Portion ')), 'Portion is not a separate row');
    if (scenario.total === null) {
        assert(cardRows.some(row => row.startsWith("Hifz Muraja'a Pending 35 / 100 Pending")));
        assert(cardText.endsWith('Result pending — all subjects must be submitted.'));
    } else {
        assert(cardRows.some(row => row.startsWith(`Hifz Muraja'a ${scenario.recitation} / 100 35 / 100 ${scenario.recitation >= 35 ? 'Pass' : 'Fail'}`)));
        assert(cardText.endsWith(`Total: ${scenario.total} / 200 · ${(scenario.total / 2).toFixed(1)}% · ${scenario.passed ? 'Pass' : 'Fail'}`));
    }
}

const register = render('register');
assert(register.includes('Group Result'));
assert(register.includes('Overall Result'));
assert(register.includes('Grade'));
const registerRows = rows(register).slice(1);
assert.equal(registerRows.length, scenarios.length * subjects.length);
for (const scenario of scenarios) {
    const studentRows = registerRows.filter(row => row.includes(scenario.name));
    assert.equal(studentRows.length, 3);
    for (const row of studentRows) {
        if (scenario.total === null) assert(row.includes('Pending'));
        else assert(row.includes(`${scenario.total} / 200 · ${scenario.passed ? 'Pass' : 'Fail'}`));
    }
}
assert.equal(articles(render('individual', {}, { search: 'Exact Boundary' })).length, 1, 'search keeps result groups intact');
assert.equal(articles(render('individual', {}, { center: 'unmatched-center' })).length, 0);
assert.match(subjectPassLabel(subjects[0], subjects), /Hifz Valuation \+ Hifz Portion.*Group pass 35 \/ 100/);
assert.match(subjectPassLabel(subjects[1], subjects), /Group pass 35 \/ 100/);
assert.match(subjectPassLabel(subjects[2], subjects), /Group pass 35 \/ 100/);

// Ordinary subjects keep their independent pass threshold and cannot inherit this exam's groups.
const ordinarySubjects = [{ ...commonSubject, id: 'ordinary', name: 'Ordinary Subject', min_marks: 40, max_marks: 100 }];
const ordinaryValuations = [{ ...valuations[0], subject_id: 'ordinary', total: 39 }];
const ordinaryHtml = render('individual', { students: [students[0]], subjects: ordinarySubjects, valuations: ordinaryValuations });
assert(rows(ordinaryHtml).some(row => row.includes('Ordinary Subject 39 / 100 40 / 100 Fail')));
assert(plain(ordinaryHtml).endsWith('Total: 39 / 100 · 39.0% · Fail'));
assert(!ordinaryHtml.includes('Pass requirements'));
assert.equal(subjectPassLabel(ordinarySubjects[0], ordinarySubjects), 'Pass 40');

// A draft with a numerical total is still incomplete, even when its mark would pass.
const draft = valuations.map(v => v.student_id === 'R003' && v.subject_id === 'murajaa' ? { ...v, status: 'draft' } : v);
const draftHtml = render('individual', { students: [students[2]], valuations: draft });
assert(plain(draftHtml).endsWith('Result pending — all subjects must be submitted.'));
assert.equal(studentResult(students[2], subjects, draft).passed, false);
console.log('Grouped Hifz UI regression passed: 30/40 and 40/30 fail, 35/35 passes, 80/0 fails, null/draft remain pending, group labels show 35/100 and total 70/200, register and individual reports agree, and ungrouped subjects retain their own pass rules. No database or network used.');
