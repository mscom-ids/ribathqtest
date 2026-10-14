import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const code = fs.readFileSync(path.resolve(__dirname, '../../../docs/n8n-student-movement-message.js'), 'utf8');
const build = new Function('$input', 'Math', code);
const source = {
  notification_id: 'template-test', event: 'student_exit', to: '919000000001',
  student_name: 'Test Student', companion_name: 'Test Guardian', companion_relationship: 'Father',
  occurred_at: '2026-10-14T09:30:00+05:30',
};
const run = (body: Record<string, unknown>, random: number) => build(
  { first: () => ({ json: { body } }) }, { floor: Math.floor, random: () => random },
)[0].json;
const messages = new Set<string>();
for (const [index, random] of [0, 0.2, 0.4, 0.6, 0.999999].entries()) {
  const result = run(source, random);
  assert.equal(result.selected_template_index, index + 1);
  assert.equal(result.test_template_index, undefined);
  assert.equal(result.payload.to, source.to);
  for (const value of ['Test Student', 'Test Guardian', 'Father', '14 October 2026', '09:30 am', 'Ribathul Quran']) {
    assert.ok(result.payload.body.includes(value));
  }
  assert.ok(!result.payload.body.includes('TEST TEMPLATE'));
  assert.ok(!result.payload.body.includes('IST'));
  messages.add(result.payload.body);
}
assert.equal(messages.size, 5);
assert.equal(run(source, 0.4).payload.body, run({ ...source, to: '919000000002' }, 0.4).payload.body);
const preview = { ...source, to: '918921551686', student_id: 'R999', test_notification: true, test_template_index: 2 };
assert.equal(run(preview, 0.9).test_template_index, 2);
assert.equal((run({ ...preview, test_template_bundle: true }, 0).payload.body.match(/TEST TEMPLATE /g) || []).length, 5);
for (const invalid of [{ to: source.to }, { student_id: 'R001' }, { test_notification: false }, { test_template_index: 6 }]) {
  assert.throws(() => run({ ...preview, ...invalid }, 0));
}
assert.throws(() => run({ ...source, test_template_bundle: true }, 0));
const arrival = run({ ...source, event: 'student_return' }, 0);
assert.ok(arrival.payload.body.includes('arrived back on campus'));
assert.ok(arrival.payload.body.endsWith('— Ribathul Quran'));
assert.equal(arrival.selected_template_index, undefined);
assert.ok(!arrival.payload.body.includes('IST'));
const midnight = run({ ...source, occurred_at: '2026-10-13T20:16:00Z' }, 0.4);
assert.ok(midnight.payload.body.includes('14 October 2026 at 01:46 am.'));
console.log('Random template selection, detail substitution, repetition, and test-only guards passed without sending.');
