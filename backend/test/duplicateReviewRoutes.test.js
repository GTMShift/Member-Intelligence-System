const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createServer } = require('node:http');
const supabasePath = require.resolve('../supabaseClient');
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: {} };
const { createDuplicateReviewRouter } = require('../routes/duplicateReview');

const users = {
  'admin-token': { id: 'admin-user' },
  'member-token': { id: 'member-user' },
  'applicant-token': { id: 'applicant-user' },
};
const profiles = {
  'admin-user': { role: 'admin', member_id: null },
  'member-user': { role: 'member', member_id: 'member-1' },
  'applicant-user': { role: 'applicant', member_id: null },
};
let rpcCall;

const client = {
  auth: {
    getUser: async (token) => users[token]
      ? { data: { user: users[token] }, error: null }
      : { data: { user: null }, error: new Error('Invalid token') },
  },
  rpc: async (name, args) => {
    rpcCall = { name, args };
    return { data: { auditId: 'audit-id', survivorId: args.p_survivor_id, mergedMemberId: 'loser-id', movedRecordCounts: {} }, error: null };
  },
  from(table) {
    const query = { filters: {} };
    const chain = {
      select() { return chain; },
      eq(key, value) { query.filters[key] = value; return chain; },
      order() { return chain; },
      limit() { return Promise.resolve({ data: [], error: null }); },
      maybeSingle() { return Promise.resolve({ data: profiles[query.filters.id] ?? null, error: null }); },
    };
    assert.ok(['profiles', 'duplicate_review_pairs'].includes(table));
    return chain;
  },
};

test('duplicate review endpoints require an admin profile', async (t) => {
  const app = express();
  app.use(express.json());
  app.use(createDuplicateReviewRouter(client));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${server.address().port}/`;

  for (const [name, token, expected] of [
    ['anonymous caller', null, 401],
    ['member caller', 'member-token', 403],
    ['applicant caller', 'applicant-token', 403],
    ['admin caller', 'admin-token', 200],
  ]) {
    await t.test(name, async () => {
      const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      assert.equal(response.status, expected);
    });
  }

  await t.test('admin can confirm a merge with a chosen survivor and field sources', async () => {
    const response = await fetch(`${url}00000000-0000-4000-8000-000000000401/merge`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ survivorId: '00000000-0000-4000-8000-000000000201', fieldSources: { email: 'b', city: 'a' } }),
    });
    assert.equal(response.status, 200);
    assert.equal(rpcCall.name, 'merge_duplicate_members');
    assert.equal(rpcCall.args.p_admin_id, 'admin-user');
    assert.deepEqual(rpcCall.args.p_field_sources, { email: 'b', city: 'a' });
  });

  await t.test('merge rejects unrecognized field sources before calling the database', async () => {
    rpcCall = undefined;
    const response = await fetch(`${url}00000000-0000-4000-8000-000000000401/merge`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ survivorId: '00000000-0000-4000-8000-000000000201', fieldSources: { role: 'a' } }),
    });
    assert.equal(response.status, 400);
    assert.equal(rpcCall, undefined);
  });
});
