const test = require('node:test');
const assert = require('node:assert/strict');

const profiles = {
  'member-token': { id: 'member-user', role: 'member', member_id: 'member-1' },
  'admin-token': { id: 'admin-user', role: 'admin', member_id: null },
  'applicant-token': { id: 'applicant-user', role: 'applicant', member_id: null },
};
let signupInsert;

const supabaseMock = {
  auth: {
    getUser: async (token) => profiles[token]
      ? { data: { user: { id: profiles[token].id } } }
      : { data: null, error: new Error('invalid token') },
  },
  from(table) {
    const query = { filters: {}, operation: 'select' };
    const chain = {
      select() { return chain; },
      eq(key, value) { query.filters[key] = value; return chain; },
      insert(payload) { query.operation = 'insert'; query.payload = payload; return chain; },
      update(payload) { query.operation = 'update'; query.payload = payload; return chain; },
      order() { return Promise.resolve({ data: [], error: null }); },
      single: () => execute(),
      maybeSingle: () => execute(),
    };

    function execute() {
      if (table === 'profiles') {
        const profile = Object.values(profiles).find((item) => item.id === query.filters.id);
        return Promise.resolve({ data: profile || null, error: null });
      }
      if (query.operation === 'insert' && table === 'event_signups') {
        signupInsert = query.payload;
        return Promise.resolve({ data: { id: 'signup-1', ...query.payload }, error: null });
      }
      if (query.operation === 'insert' && table === 'events') {
        return Promise.resolve({ data: { id: 'event-1', ...query.payload }, error: null });
      }
      if (table === 'events') return Promise.resolve({ data: { id: query.filters.id }, error: null });
      if (table === 'members') return Promise.resolve({ data: { id: query.filters.id }, error: null });
      if (table === 'event_signups') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    }

    return chain;
  },
};

const supabasePath = require.resolve('../supabaseClient');
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: supabaseMock };
const eventsRouter = require('../routes/events');

async function post(path, body, token) {
  const routeLayer = eventsRouter.stack.find((layer) => layer.route?.path === path && layer.route.methods.post);
  assert.ok(routeLayer, `POST ${path} route exists`);
  const req = {
    method: 'POST',
    params: path.includes(':id') ? { id: 'event-1' } : {},
    body,
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
    await handlers[index](req, res, (error) => {
      if (error) throw error;
      nextPromise = run(index + 1);
      return nextPromise;
    });
    if (nextPromise) await nextPromise;
  }
  await run(0);
  return res;
}

test('event creation rejects anonymous and member callers, allows admins', async () => {
  const event = { event_name: 'Test event', event_date: '2026-11-01', event_type: 'networking' };
  assert.equal((await post('/', event)).code, 401);
  assert.equal((await post('/', event, 'member-token')).code, 403);
  assert.equal((await post('/', event, 'admin-token')).code, 201);
});

test('event signup rejects anonymous and applicant callers', async () => {
  const body = { member_id: 'attacker-chosen-member', rsvp_status: 'attended' };
  assert.equal((await post('/:id/signup', body)).code, 401);
  assert.equal((await post('/:id/signup', body, 'applicant-token')).code, 403);
});

test('member signup is limited to linked member and default status', async () => {
  signupInsert = null;
  const response = await post('/:id/signup', {
    member_id: 'attacker-chosen-member',
    rsvp_status: 'attended',
    approval_status: 'approved',
    event_goal: 'Meet people',
  }, 'member-token');
  assert.equal(response.code, 201);
  assert.equal(signupInsert.member_id, 'member-1');
  assert.equal(signupInsert.rsvp_status, 'registered');
  assert.equal('approval_status' in signupInsert, false);
});
