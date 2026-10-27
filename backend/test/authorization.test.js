const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthorization } = require('../middleware/authorization');

function harness({ user, profile, authError, profileError } = {}) {
  const supabase = {
    auth: { getUser: async () => ({ data: { user }, error: authError }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: profile, error: profileError }) }),
      }),
    }),
  };
  const middleware = createAuthorization(supabase);
  const req = { get: (name) => name.toLowerCase() === 'authorization' ? 'Bearer test-token' : undefined };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  return { middleware, req, res, next, get nextCalled() { return nextCalled; } };
}

test('anonymous requests are rejected', async () => {
  const { middleware, req, res, next } = harness();
  req.get = () => undefined;
  await middleware.authenticate(req, res, next);
  assert.equal(res.statusCode, 401);
});

test('invalid tokens are rejected', async () => {
  const { middleware, req, res, next } = harness({ authError: new Error('invalid') });
  await middleware.authenticate(req, res, next);
  assert.equal(res.statusCode, 401);
});

test('members can access only their own member-scoped route and cannot use admin routes', async () => {
  const ctx = harness({
    user: { id: 'user-member' },
    profile: { id: 'user-member', role: 'member', member_id: 'member-own' },
  });
  await ctx.middleware.authenticate(ctx.req, ctx.res, ctx.next);
  assert.equal(ctx.nextCalled, true);

  let adminNext = false;
  ctx.middleware.requireAdmin(ctx.req, ctx.res, () => { adminNext = true; });
  assert.equal(adminNext, false);
  assert.equal(ctx.res.statusCode, 403);

  ctx.req.params = { id: 'member-own' };
  let selfNext = false;
  ctx.middleware.requireSelfOrAdmin()(ctx.req, ctx.res, () => { selfNext = true; });
  assert.equal(selfNext, true);

  ctx.req.params.id = 'another-member';
  let otherNext = false;
  ctx.middleware.requireSelfOrAdmin()(ctx.req, ctx.res, () => { otherNext = true; });
  assert.equal(otherNext, false);
  assert.equal(ctx.res.statusCode, 403);
});

test('admins can access admin routes', async () => {
  const ctx = harness({
    user: { id: 'user-admin' },
    profile: { id: 'user-admin', role: 'admin', member_id: null },
  });
  await ctx.middleware.authenticate(ctx.req, ctx.res, ctx.next);
  let adminNext = false;
  ctx.middleware.requireAdmin(ctx.req, ctx.res, () => { adminNext = true; });
  assert.equal(adminNext, true);
});
