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

const client = {
  auth: {
    getUser: async (token) => users[token]
      ? { data: { user: users[token] }, error: null }
      : { data: { user: null }, error: new Error('Invalid token') },
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
});
