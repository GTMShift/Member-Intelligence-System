const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthMiddleware } = require('../middleware/auth');

function res() {
  return { code: 200, status(code) { this.code = code; return this; }, json() { return this; } };
}

test('requires a valid bearer token verified by Supabase Auth', async () => {
  const auth = createAuthMiddleware({ auth: { getUser: async () => ({ error: new Error('invalid') }) } });
  const result = res();
  await auth.requireAuth({ headers: {}, get: () => undefined }, result, () => assert.fail('unexpected access'));
  assert.equal(result.code, 401);
  await auth.requireAuth({ headers: {}, get: () => 'Bearer invalid' }, result, () => assert.fail('unexpected access'));
  assert.equal(result.code, 401);
});

test('allows only explicit database profile roles', async () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'applicant' } }) }) }) }),
  };
  const auth = createAuthMiddleware(client);
  const req = { headers: {}, get: () => 'Bearer valid' };
  const result = res();
  await auth.requireAuth(req, result, () => {});
  await auth.requireRole(['admin', 'member'])(req, result, () => assert.fail('unknown role must be denied'));
  assert.equal(result.code, 403);
});

test('loads admin role and member link from the server-side profile', async () => {
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'admin', member_id: null } }) }) }) }),
  };
  const auth = createAuthMiddleware(client);
  const req = { user: { id: 'user-1' } };
  const result = res();
  let continued = false;
  await auth.requireRole(['admin'])(req, result, () => { continued = true; });
  assert.equal(continued, true);
  assert.deepEqual(req.profile, { role: 'admin', member_id: null });
});
