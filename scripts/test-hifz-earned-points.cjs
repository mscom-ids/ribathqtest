const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const source = fs.readFileSync(require.resolve('../src/lib/hifz-performance.ts'), 'utf8')
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
const context = {exports:{}}
vm.runInNewContext(compiled, context)
const points = context.exports.getHifzPerformancePoints
// Same 0.33 earned, but applicable maxima differ (55 vs 70). Previously
// percentage * 0.7 displayed 0.42 for the first and 0.33 for the second.
assert.equal(points({totalPoints:0.33,percentage:0.6}),0.33)
assert.equal(points({totalPoints:0.33,percentage:0.47}),0.33)
assert.equal(points({totalPoints:0,percentage:100}),0)
assert.equal(points({total_points:'1.82'}),1.82)
assert.equal(points({points:'2.5'}),2.5)
assert.equal(points({percentage:50}),null,'do not invent points when only a percentage is available')
assert.equal(points({totalPoints:null}),null)
console.log('Earned-points regression passed: 0.33 stays 0.33 regardless of Juz applicability or percentage.');
