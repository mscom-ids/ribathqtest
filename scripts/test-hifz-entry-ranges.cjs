const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

// Load the shared UI grouping logic without booting Next or connecting to a DB.
const previousLoader = require.extensions['.ts']
require.extensions['.ts'] = (module, filename) => {
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    })
    module._compile(compiled.outputText, filename)
}
try {
    const { SURAH_LIST } = require('../src/lib/data/surah-list.ts')
    const { groupContinuousSurahEntries } = require('../src/lib/hifz-entry-ranges.ts')
    const full = id => {
        const surah = SURAH_LIST.find(item => item.id === id)
        return { id: `saved-${id}`, surah_name: surah.name, start_v: '1', end_v: String(surah.totalVerses) }
    }
    const original = SURAH_LIST.filter(surah => surah.id >= 99).map(surah => full(surah.id))
    const shuffled = [...original].reverse()
    const before = JSON.stringify(shuffled)
    const grouped = groupContinuousSurahEntries(shuffled)
    assert.equal(grouped.length, 1, 'saved Az-Zalzalah → An-Nas reopens as one continuous range');
    assert.equal(grouped[0][0].surah_name, full(99).surah_name)
    assert.equal(grouped[0].at(-1).surah_name, full(114).surah_name)
    assert.deepEqual(grouped[0].map(entry => entry.id), original.map(entry => entry.id), 'every saved row remains editable/deletable');
    assert.equal(JSON.stringify(shuffled), before, 'grouping cannot mutate the loaded entries');
    assert.equal(groupContinuousSurahEntries([full(112), full(102), full(105)]).length, 3, 'separate Surahs must not imply missing Quran coverage');
    const pieces = [
        { ...full(36), id: 'later', start_v: 17, end_v: 22 },
        { ...full(36), id: 'earlier', start_v: 7, end_v: 16 },
    ]
    assert.deepEqual(groupContinuousSurahEntries(pieces).map(group => group.map(row => row.id)), [['earlier', 'later']]);
    assert.equal(groupContinuousSurahEntries([{ ...full(36), end_v: 10 }, { ...full(36), start_v: 12 }]).length, 2, 'one missing ayah breaks continuity');
    assert.equal(groupContinuousSurahEntries([full(113), full(113)]).length, 2, 'duplicate records must not be silently removed');
    const invalid = { id: 'incomplete', surah_name: full(99).surah_name, start_v: '', end_v: '' }
    assert.deepEqual(groupContinuousSurahEntries([invalid]), [[invalid]], 'incomplete entries stay available for correction');
    assert.deepEqual(groupContinuousSurahEntries([]), [])
    console.log('Hifz range regression checks passed: shuffled saved ranges, gaps, same-Surah ranges, IDs, duplicates, incomplete entries.');
} finally {
    if (previousLoader) require.extensions['.ts'] = previousLoader
    else delete require.extensions['.ts']
}
