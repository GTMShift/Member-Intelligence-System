const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDuplicateCandidates, normalizeEmail, normalizeLinkedIn, normalizePhone } = require('../utils/duplicateDetection');

test('normalizes email, LinkedIn URL, and phone before comparing', () => {
  assert.equal(normalizeEmail(' Will@Example.com '), 'will@example.com');
  assert.equal(normalizeLinkedIn('https://www.linkedin.com/in/Will-Blum/?trk=abc'), 'linkedin.com/in/will-blum');
  assert.equal(normalizePhone('+1 (312) 555-0100'), '13125550100');
});

test('flags normalized email and LinkedIn matches with high confidence', () => {
  const pairs = buildDuplicateCandidates([
    { id: 'b', first_name: 'Will', last_name: 'Blum', email: 'WILL@example.com', linkedin_url: 'https://www.linkedin.com/in/will-blum/' },
    { id: 'a', first_name: 'William', last_name: 'Blum', email: 'will@example.com', linkedin_url: 'linkedin.com/in/will-blum' },
  ]);
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0].member_low_id, pairs[0].member_high_id], ['a', 'b']);
  assert.equal(pairs[0].confidence, 0.995);
  assert.ok(pairs[0].match_reasons.some((reason) => reason.field === 'email'));
  assert.ok(pairs[0].match_reasons.some((reason) => reason.field === 'linkedin_url'));
});

test('uses phone only when supported by a similar name', () => {
  const pair = buildDuplicateCandidates([
    { id: 'one', first_name: 'Catherine', last_name: 'Jones', phone: '(312) 555-0100' },
    { id: 'two', first_name: 'Katherine', last_name: 'Jones', phone: '3125550100' },
  ]);
  assert.equal(pair.length, 1);
  assert.equal(pair[0].confidence, 0.84);
  assert.ok(pair[0].match_reasons.some((reason) => reason.field === 'name'));
});

test('does not propose weak name-only or phone-only matches', () => {
  const pair = buildDuplicateCandidates([
    { id: 'one', first_name: 'Alex', last_name: 'Morgan', phone: '3125550100' },
    { id: 'two', first_name: 'Alex', last_name: 'Morgan', phone: '3125550199' },
    { id: 'three', first_name: 'Other', last_name: 'Person', phone: '3125550100' },
  ]);
  assert.deepEqual(pair, []);
});

test('requires a supporting company or role signal alongside similar names', () => {
  const members = [
    { id: 'one', first_name: 'Catherine', last_name: 'Jones', employment_history: [{ company: 'Acme', role: 'VP Operations', is_current: true }] },
    { id: 'two', first_name: 'Katherine', last_name: 'Jones', employment_history: [{ company: 'Acme, Inc.', role: 'VP Operations', is_current: true }] },
  ];
  assert.equal(buildDuplicateCandidates(members).length, 1);
});
