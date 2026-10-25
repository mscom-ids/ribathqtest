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
const run = (body: Record<string, unknown>) => build(
  { first: () => ({ json: { body } }) }, { random: () => { throw new Error('Random selection must not be used'); } },
)[0].json;
const expected = "Dear Parent\nThe following campus departure has been recorded for your information:\n\n*Student:* Test Student\n*Accompanying person:* Test Guardian\n*Relationship:* Father\n*Departure date:* 14 October 2026\n*Exit time:* 09:30 am IST\n\nWe are sharing this update to help you stay informed about your child's movements. For any clarification or correction to the recorded details, please get in touch with the institution.\n— *Ribathul Quran*";
assert.equal(run(source).payload.body, expected);
assert.equal(run(source).payload.to, source.to);
assert.equal(run(source).selected_template_index, undefined);
for (let attempt = 0; attempt < 10; attempt++) assert.equal(run(source).payload.body, expected);
assert.equal(run({ ...source, to: '919000000002' }).payload.body, expected);
assert.equal(run({ ...source, wa_number_id: 'school-sender' }).payload.wa_number_id, 'school-sender');
for (const deprecated of [{ test_template_index: 1 }, { test_template_index: 5 }, { test_template_bundle: true }, { test_template_bundle: false }]) {
  assert.throws(() => run({ ...source, ...deprecated }), /no longer supported/);
}
assert.throws(() => run({ ...source, companion_name: '' }));
assert.throws(() => run({ ...source, companion_relationship: '' }));
assert.throws(() => run({ ...source, to: 'not-a-phone' }));
const arrival = run({ ...source, event: 'student_return', companion_name: null, companion_relationship: null });
assert.equal(arrival.payload.body, 'Dear Parent, Test Student arrived back on campus on 14 October 2026 at 09:30 am.\n— Ribathul Quran');
assert.equal(arrival.selected_template_index, undefined);
assert.ok(!arrival.payload.body.includes('IST'));
const midnight = run({ ...source, occurred_at: '2026-10-13T20:16:00Z' });
assert.ok(midnight.payload.body.includes('*Departure date:* 14 October 2026\n*Exit time:* 01:46 am IST'));
console.log('Single departure template, exact wording, no randomness, Indian time and unchanged arrival passed without sending.');
