import assert from 'node:assert/strict';
import { calculateHifzReportPoints, HifzLog } from '../utils/hifz-calculator';

const options = {
    expectedClassDaysOverride: 20, firstJuzCompletionDate: '2026-09-01',
    periodStartDate: '2026-10-01', periodEndDate: '2026-10-31',
};
const clear: HifzLog = { mode: 'Recent Revision', entry_date: '2026-10-12', juz_number: 1, juz_portion: '1st Half' };
const score = (logs: HifzLog[]) => calculateHifzReportPoints(logs, [], options);
const half = score([clear]);
assert.equal(half.recentRevisionPoints, 1.43);
assert.equal(half.juzPoints, 1);
assert.equal(half.totalPoints, 2.43);
assert.equal(score([{ ...clear, juz_portion: 'Full' }]).juzPoints, 2);
assert.equal(score([{ ...clear, juz_portion: 'Q1' }]).juzPoints, 0.5);
const daily: HifzLog = { mode: 'Recent Revision', entry_date: clear.entry_date, surah_name: 'Al-Fatihah', start_v: 1, end_v: 7 };
assert.equal(score([daily]).juzPoints, 0);
assert.equal(score([daily, clear]).recentRevisionPoints, 1.43, 'recent credit is once per day, not once per row');
assert.equal(score([clear, { ...clear, juz_portion: '2nd Half' }]).juzPoints, 2);
assert.equal(score([{ ...clear, juz_number: 31 }]).juzPoints, 0);
assert.equal(calculateHifzReportPoints([clear], [], { ...options, firstJuzCompletionDate: null }).juzPoints, 0);
assert.equal(calculateHifzReportPoints([clear], [], { ...options, isHafiz: true }).juzPoints, 0, 'Hafiz New/Old scoring stays unchanged');
const many = Array.from({ length: 28 }, (_, index) => ({ ...clear, entry_date: `2026-10-${String(index + 1).padStart(2, '0')}`, juz_portion: 'Full' }));
assert.equal(score(many).recentRevisionPoints, 20);
assert.equal(score(many).juzPoints, 20);
console.log('Recent Revision Juz Clear scoring passed with 20-point revision weights (1.43 + 1 = 2.43).');
