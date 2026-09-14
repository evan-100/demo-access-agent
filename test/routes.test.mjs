import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app/routes.mjs';
import { createAuthz } from '../app/authz.mjs';

const groupsByUser = { admin: ['Demo-Admin'], ro: ['Demo-ReadOnly'], none: [] };
const okta = { listUserGroups: async (id) => (groupsByUser[id] ?? []).map((name) => ({ profile: { name } })) };

// Stub for express-openid-connect: identity comes from the x-test-user header.
function authMiddleware(req, res, next) {
  const sub = req.get('x-test-user');
  req.oidc = {
    isAuthenticated: () => Boolean(sub),
    user: sub ? { sub, name: `User ${sub}`, email: `${sub}@example.com`, groups: groupsByUser[sub] ?? [] } : undefined,
  };
  next();
}

const app = createApp({ authMiddleware, authz: createAuthz({ okta }) });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

const get = (path, user) => fetch(`${base}${path}`, { headers: user ? { 'x-test-user': user } : {}, redirect: 'manual' });

test('home is public and healthz answers', async () => {
  assert.equal((await get('/')).status, 200);
  assert.equal(await (await get('/healthz')).text(), 'ok');
});

test('protected pages redirect anonymous users to /login', async () => {
  const res = await get('/dashboard');
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /^\/login/);
});

test('read-only user sees dashboard and records without edit controls, not settings', async () => {
  assert.equal((await get('/dashboard', 'ro')).status, 200);
  const records = await get('/records', 'ro');
  assert.equal(records.status, 200);
  assert.doesNotMatch(await records.text(), /data-action="edit"/);
  assert.equal((await get('/settings', 'ro')).status, 403);
});

test('admin sees edit controls and settings', async () => {
  const records = await get('/records', 'admin');
  assert.match(await records.text(), /data-action="edit"/);
  assert.equal((await get('/settings', 'admin')).status, 200);
});

test('logged-in user with no Demo- group is denied everywhere', async () => {
  assert.equal((await get('/dashboard', 'none')).status, 403);
});

test('an authz failure is caught by the terminal error handler, not leaked', async () => {
  const brokenOkta = { listUserGroups: async () => { throw new Error('Okta down at /Users/evan/secret'); } };
  const brokenApp = createApp({ authMiddleware, authz: createAuthz({ okta: brokenOkta }) });
  const brokenServer = brokenApp.listen(0);
  const brokenBase = `http://127.0.0.1:${brokenServer.address().port}`;
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await fetch(`${brokenBase}/dashboard`, { headers: { 'x-test-user': 'ro' }, redirect: 'manual' });
    assert.equal(res.status, 500);
    const body = await res.text();
    assert.match(body, /Something went wrong/);
    assert.doesNotMatch(body, /\bat\s+\S+\s*\(/);
    assert.doesNotMatch(body, /\/Users\//);
  } finally {
    console.error = originalError;
    brokenServer.close();
  }
});
