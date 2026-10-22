const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

// Exercise the actual request normalizer without importing controllers, opening
// a database pool, or writing student records.
const source = fs.readFileSync(require.resolve('../backend/src/controllers/hifz.controller.ts'), 'utf8')
const ast = ts.createSourceFile('hifz.controller.ts', source, ts.ScriptTarget.Latest, true)
const names = new Set(['normalizeHifzLogInput', 'toNullableNumber', 'hifzValidationError'])
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(ast)).join('\n')
assert.equal(ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).length, 3)
const constants = ast.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ['VALID_HIFZ_MODES', 'VALID_JUZ_PORTIONS'].includes(declaration.name.getText(ast)))).map(node => node.getText(ast)).join('\n')
const js = ts.transpileModule(`${constants}\n${functions}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
const context = { toDateKey: value => value ? String(value).slice(0, 10) : '' }
vm.createContext(context)
vm.runInContext(js, context)
const normalize = context.normalizeHifzLogInput
const base = { student_id: 'test-only', entry_date: '2026-10-12', mode: 'Recent Revision', juz_number: 1, juz_portion: '1st Half' }
assert.equal(normalize(base).juz_number, 1)
assert.equal(normalize(base).surah_name, null)
assert.equal(normalize(base).mode, 'Recent Revision', 'Juz Clear retains recent-day credit')
for (const juz_portion of ['Full', '1st Half', '2nd Half', 'Q1', 'Q2', 'Q3', 'Q4']) assert.equal(normalize({ ...base, juz_portion }).juz_portion, juz_portion)
for (const juz_number of [0, 31, 1.5, 'invalid']) assert.throws(() => normalize({ ...base, juz_number }), /Juz number/)
assert.throws(() => normalize({ ...base, juz_portion: '' }), /Juz portion/)
assert.throws(() => normalize({ ...base, surah_name: 'Al-Fatihah', start_v: 1, end_v: 7 }), /not both/)
assert.throws(() => normalize({ ...base, mode: 'New Verses' }), /Surah/)
const daily = normalize({ student_id: 'test-only', entry_date: base.entry_date, mode: base.mode, surah_name: 'Al-Fatihah', start_v: 1, end_v: 7 })
assert.equal(daily.surah_name, 'Al-Fatihah')
assert.equal(daily.juz_number, null)
console.log('Juz Clear request validation passed: full/half/quarters, exclusive Surah/Juz, unchanged daily entry, invalid values rejected.')
