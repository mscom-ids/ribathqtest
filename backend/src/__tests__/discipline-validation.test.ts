import assert from 'node:assert/strict';
import { pagination, parseIncidentCreate, parseReview } from '../modules/discipline/discipline.validation';

let passed = 0;
function test(name: string, run: () => void) { run(); passed += 1; console.log(`PASS ${name}`); }
function validIncident(overrides: Record<string, unknown> = {}) { return { student_id: 'R100', category_id: 'category-1', offence_type_id: 'offence-1', severity: 'moderate', reported_at: '2026-07-22T10:30:00+05:30', short_description: 'Repeated disruption during supervised study.', ...overrides }; }

test('normalizes a valid incident and preserves a draft', () => {
    const result = parseIncidentCreate(validIncident({ save_as_draft: true, student_position: 'accepted' }));
    assert.equal(result.severity, 'moderate'); assert.equal(result.save_as_draft, true); assert.equal(result.student_position, 'accepted');
});
test('rejects invalid dates and student positions', () => {
    assert.throws(() => parseIncidentCreate(validIncident({ reported_at: 'not-a-date' })), /Invalid incident date and time/);
    assert.throws(() => parseIncidentCreate(validIncident({ student_position: 'unknown' })), /Invalid student position/);
});
test('requires the core incident fields', () => {
    assert.throws(() => parseIncidentCreate(validIncident({ student_id: '' })), /Student is required/);
    assert.throws(() => parseIncidentCreate(validIncident({ short_description: '' })), /Short description is required/);
});
test('validates review decisions and severity', () => {
    const result = parseReview({ decision: 'assign_action', severity: 'major' }); assert.equal(result.decision, 'assign_action'); assert.equal(result.severity, 'major');
    assert.throws(() => parseReview({ decision: 'ignore' }), /Invalid review decision/);
});
test('bounds pagination to safe server limits', () => {
    assert.deepEqual(pagination({ page: -2, limit: 1000 }), { page: 1, limit: 100, offset: 0 });
    assert.deepEqual(pagination({ page: 3, limit: 5 }), { page: 3, limit: 10, offset: 20 });
});
console.log(`${passed} discipline validation tests passed.`);
