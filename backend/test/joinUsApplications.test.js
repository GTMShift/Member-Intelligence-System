const test = require('node:test');
const assert = require('node:assert/strict');

const profiles = {
  'admin-token': { id: 'admin-user', role: 'admin' },
  'member-token': { id: 'member-user', role: 'member' },
};

// Applications keyed by id. `updateError` simulates a database trigger error,
// `raceToReviewed` simulates another admin deciding between read and update.
let applications;
let lastUpdate;

function resetApplications() {
  lastUpdate = null;
  applications = {
    'app-pending': { id: 'app-pending', status: 'pending' },
    'app-approved': { id: 'app-approved', status: 'approved' },
    'app-race': { id: 'app-race', status: 'pending', raceToReviewed: true },
    'app-no-linkedin': { id: 'app-no-linkedin', status: 'pending', updateError: { message: 'LinkedIn URL is required to create a new member from a Join Us application' } },
    'app-linked-elsewhere': { id: 'app-linked-elsewhere', status: 'pending', updateError: { message: 'Member record is already linked to a different login' } },
    'app-ambiguous': { id: 'app-ambiguous', status: 'pending', updateError: { message: 'Ambiguous member match: email and LinkedIn belong to different members' } },
    'app-db-down': { id: 'app-db-down', status: 'pending', updateError: { message: 'connection to server lost', code: '08006' } },
  };
}

const supabaseMock = {
  auth: {
    getUser: async (token) => profiles[token]
      ? { data: { user: { id: profiles[token].id } }, error: null }
      : { data: { user: null }, error: new Error('invalid token') },
  },
  from(table) {
    const query = { filters: {}, operation: 'select' };
    const chain = {
      select() { return chain; },
      order() { return chain; },
      eq(key, value) { query.filters[key] = value; return chain; },
      update(payload) { query.operation = 'update'; query.payload = payload; return chain; },
      maybeSingle: () => execute(),
      single: () => execute(),
      then(resolve, reject) { return Promise.resolve({ data: Object.values(applications), error: null }).then(resolve, reject); },
    };

    function execute() {
      if (table === 'profiles') {
        const profile = Object.values(profiles).find((item) => item.id === query.filters.id);
        return Promise.resolve({ data: profile ? { role: profile.role } : null, error: null });
      }
      const row = applications[query.filters.id];
      if (query.operation === 'select') {
        return Promise.resolve({ data: row ? { id: row.id, status: row.status } : null, error: null });
      }
      lastUpdate = { filters: { ...query.filters }, payload: query.payload };
      if (row?.raceToReviewed) row.status = 'rejected';
      if (row?.updateError) return Promise.resolve({ data: null, error: row.updateError });
      if (!row || (query.filters.status && row.status !== query.filters.status)) {
        return Promise.resolve({ data: null, error: null });
      }
      row.status = query.payload.status;
      return Promise.resolve({
        data: { id: row.id, status: row.status, member_id: row.status === 'approved' ? 'member-1' : undefined },
        error: null,
      });
    }

    return chain;
  },
};

const supabasePath = require.resolve('../supabaseClient');
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: supabaseMock };
const router = require('../routes/joinUsApplications');

async function post(path, applicationId, token) {
  const routeLayer = router.stack.find((layer) => layer.route?.path === path && layer.route.methods.post);
  assert.ok(routeLayer, `POST ${path} route exists`);
  const req = {
    method: 'POST',
    params: { applicationId },
    body: {},
    query: {},
    headers: token ? { authorization: `Bearer ${token}` } : {},
    get(name) { return this.headers[name.toLowerCase()]; },
  };
  const res = {
    code: 200,
    status(code) { this.code = code; return this; },
    json(data) { this.data = data; return this; },
  };
  const handlers = routeLayer.route.stack.map((layer) => layer.handle);
  async function run(index) {
    if (index >= handlers.length) return;
    let nextPromise;
    await handlers[index](req, res, () => {
      nextPromise = run(index + 1);
      return nextPromise;
    });
    if (nextPromise) await nextPromise;
  }
  await run(0);
  return res;
}

test('approve and reject require an admin', async () => {
  resetApplications();
  assert.equal((await post('/:applicationId/approve', 'app-pending')).code, 401);
  assert.equal((await post('/:applicationId/approve', 'app-pending', 'member-token')).code, 403);
  assert.equal((await post('/:applicationId/reject', 'app-pending', 'member-token')).code, 403);
  assert.equal(applications['app-pending'].status, 'pending');
});

test('approving a pending application only updates it while still pending', async () => {
  resetApplications();
  const res = await post('/:applicationId/approve', 'app-pending', 'admin-token');
  assert.equal(res.code, 200);
  assert.deepEqual(res.data.application, { id: 'app-pending', status: 'approved', member_id: 'member-1' });
  assert.equal(lastUpdate.filters.status, 'pending');
  assert.equal(lastUpdate.payload.reviewed_by, 'admin-user');
});

test('rejecting a pending application works', async () => {
  resetApplications();
  const res = await post('/:applicationId/reject', 'app-pending', 'admin-token');
  assert.equal(res.code, 200);
  assert.equal(res.data.application.status, 'rejected');
});

test('missing and already decided applications are refused', async () => {
  resetApplications();
  assert.equal((await post('/:applicationId/approve', 'app-missing', 'admin-token')).code, 404);
  const decided = await post('/:applicationId/reject', 'app-approved', 'admin-token');
  assert.equal(decided.code, 409);
  assert.equal(applications['app-approved'].status, 'approved');
});

test('two admins deciding at once: the second gets a conflict, not a silent overwrite', async () => {
  resetApplications();
  const res = await post('/:applicationId/approve', 'app-race', 'admin-token');
  assert.equal(res.code, 409);
  assert.equal(res.data.error, 'This application has already been reviewed.');
  assert.equal(applications['app-race'].status, 'rejected');
});

test('database approval rules come back as clear conflicts', async () => {
  resetApplications();
  const noLinkedIn = await post('/:applicationId/approve', 'app-no-linkedin', 'admin-token');
  assert.equal(noLinkedIn.code, 409);
  assert.match(noLinkedIn.data.error, /no LinkedIn URL/);

  const linkedElsewhere = await post('/:applicationId/approve', 'app-linked-elsewhere', 'admin-token');
  assert.equal(linkedElsewhere.code, 409);
  assert.match(linkedElsewhere.data.error, /already linked to a different login/);

  const ambiguous = await post('/:applicationId/approve', 'app-ambiguous', 'admin-token');
  assert.equal(ambiguous.code, 409);
  assert.match(ambiguous.data.error, /match different members/);
});

test('unexpected database errors do not leak their message', async () => {
  resetApplications();
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const res = await post('/:applicationId/approve', 'app-db-down', 'admin-token');
    assert.equal(res.code, 500);
    assert.equal(res.data.error, 'Request failed');
  } finally {
    console.error = originalConsoleError;
  }
});
