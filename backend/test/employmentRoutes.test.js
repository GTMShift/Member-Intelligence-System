const test = require('node:test');
const assert = require('node:assert/strict');

// Load the real app (with its real route order) without starting the server.
process.env.BACKEND_NO_LISTEN = '1';

const users = {
  'member-token': { id: 'member-user', role: 'member', member_id: 'member-1' },
  'admin-token': { id: 'admin-user', role: 'admin', member_id: null },
  'applicant-token': { id: 'applicant-user', role: 'applicant', member_id: null },
};

const memberIds = ['member-1', 'member-2'];

const history = [
  { id: 'job-2', member_id: 'member-1', company: 'Microsoft', role: 'Director', start_date: '2026-11-01', end_date: null, is_current: true, source: 'Manual' },
  { id: 'job-1', member_id: 'member-1', company: 'Salesforce', role: 'Manager', start_date: '2021-03-01', end_date: '2026-10-31', is_current: false, source: 'Manual' },
];

let rpcCalls;
let rpcResponse;

function reset() {
  rpcCalls = [];
  rpcResponse = { data: { current: history[0], history }, error: null };
}

const supabaseMock = {
  auth: {
    getUser: async (token) => users[token]
      ? { data: { user: { id: users[token].id } }, error: null }
      : { data: { user: null }, error: new Error('invalid token') },
  },
  from(table) {
    const filters = {};
    const chain = {
      select() { return chain; },
      eq(key, value) { filters[key] = value; return chain; },
      order() { return chain; },
      update() { return chain; },
      maybeSingle: async () => {
        if (table !== 'profiles') return { data: null, error: null };
        const user = Object.values(users).find((item) => item.id === filters.id);
        return { data: user ? { role: user.role, member_id: user.member_id } : null, error: null };
      },
      single: async () => {
        if (table === 'members' && memberIds.includes(filters.id)) return { data: { id: filters.id }, error: null };
        return { data: null, error: null };
      },
      then(resolve, reject) {
        const rows = table === 'employment_history'
          ? history.filter((row) => row.member_id === filters.member_id)
          : [];
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return chain;
  },
  rpc: async (name, args) => {
    rpcCalls.push({ name, args });
    return rpcResponse;
  },
};

const supabasePath = require.resolve('../supabaseClient');
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: supabaseMock };
const app = require('../index');

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

async function call(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}

test('a member can read their own career history', async () => {
  reset();
  const res = await call('GET', '/members/member-1/employment', 'member-token');
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.map((row) => row.company), ['Microsoft', 'Salesforce']);
});

test('a member can report a job change on their own record', async () => {
  reset();
  const res = await call('POST', '/members/member-1/employment/change', 'member-token', {
    company: '  Microsoft ',
    role: ' Director ',
    start_date: '2026-11-01',
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.current.company, 'Microsoft');
  assert.equal(res.data.history.length, 2);
  assert.deepEqual(rpcCalls, [{
    name: 'save_member_employment',
    args: { p_member_id: 'member-1', p_action: 'change', p_company: 'Microsoft', p_role: 'Director', p_start_date: '2026-11-01' },
  }]);
});

test('a member can correct their current job without a job change', async () => {
  reset();
  const res = await call('POST', '/members/member-1/employment/correct', 'member-token', { role: 'Senior Director' });
  assert.equal(res.status, 200);
  assert.deepEqual(rpcCalls[0].args, {
    p_member_id: 'member-1', p_action: 'correct', p_company: null, p_role: 'Senior Director', p_start_date: null,
  });
});

test('a member cannot read or change another member\'s employment', async () => {
  reset();
  assert.equal((await call('GET', '/members/member-2/employment', 'member-token')).status, 403);
  assert.equal((await call('POST', '/members/member-2/employment/change', 'member-token', {
    company: 'Microsoft', role: 'Director', start_date: '2026-11-01',
  })).status, 403);
  assert.equal((await call('POST', '/members/member-2/employment/correct', 'member-token', { role: 'VP' })).status, 403);
  assert.equal(rpcCalls.length, 0);
});

test('applicants and signed-out visitors are refused', async () => {
  reset();
  assert.equal((await call('GET', '/members/member-1/employment', 'applicant-token')).status, 403);
  assert.equal((await call('POST', '/members/member-1/employment/change', undefined, {
    company: 'Microsoft', role: 'Director', start_date: '2026-11-01',
  })).status, 401);
  assert.equal(rpcCalls.length, 0);
});

test('an admin can update any member\'s employment', async () => {
  reset();
  const res = await call('POST', '/members/member-2/employment/change', 'admin-token', {
    company: 'Microsoft', role: 'Director', start_date: '2026-11-01',
  });
  assert.equal(res.status, 200);
  assert.equal(rpcCalls[0].args.p_member_id, 'member-2');
});

test('job changes and corrections are validated before saving', async () => {
  reset();
  const missingDate = await call('POST', '/members/member-1/employment/change', 'member-token', { company: 'Microsoft', role: 'Director' });
  assert.equal(missingDate.status, 400);
  const badDate = await call('POST', '/members/member-1/employment/change', 'member-token', {
    company: 'Microsoft', role: 'Director', start_date: '2026-02-30',
  });
  assert.equal(badDate.status, 400);
  const emptyCorrection = await call('POST', '/members/member-1/employment/correct', 'member-token', {});
  assert.equal(emptyCorrection.status, 400);
  assert.equal(rpcCalls.length, 0);
});

test('database rule errors come back as clear responses', async () => {
  reset();
  rpcResponse = { data: null, error: { code: '22023', message: 'New job start date cannot be before the current job start date' } };
  const tooEarly = await call('POST', '/members/member-1/employment/change', 'member-token', {
    company: 'Microsoft', role: 'Director', start_date: '2019-01-01',
  });
  assert.equal(tooEarly.status, 400);
  assert.match(tooEarly.data.error, /cannot be before/);

  rpcResponse = { data: null, error: { code: 'P0002', message: 'Member not found' } };
  const missing = await call('POST', '/members/member-1/employment/correct', 'member-token', { role: 'VP' });
  assert.equal(missing.status, 404);
});

test('the rest of /members stays admin-only', async () => {
  reset();
  assert.equal((await call('GET', '/members/member-1', 'member-token')).status, 403);
  assert.equal((await call('PUT', '/members/member-1', 'member-token', { first_name: 'X' })).status, 403);
  assert.equal((await call('POST', '/members/member-1/employment', 'member-token', { company: 'X' })).status, 403);
});
