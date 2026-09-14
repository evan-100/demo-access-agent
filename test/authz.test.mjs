import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthz } from '../app/authz.mjs';

function fakeOkta(groupsByUser) {
  const calls = [];
  return { calls, listUserGroups: async (id) => { calls.push(id); return (groupsByUser[id] ?? []).map((name) => ({ profile: { name } })); } };
}
function fakeRes() {
  const res = { statusCode: 200, body: null, status(c) { res.statusCode = c; return res; }, send(b) { res.body = b; return res; } };
  return res;
}

test('accessFor derives the highest Demo- scope and caches for ttl', async () => {
  let t = 0;
  const okta = fakeOkta({ u1: ['Everyone', 'Demo-ReadOnly', 'Demo-Editor'] });
  const authz = createAuthz({ okta, ttlMs: 5000, now: () => t });
  assert.equal((await authz.accessFor('u1')).scope, 'editor');
  assert.deepEqual((await authz.accessFor('u1')).groups, ['Demo-ReadOnly', 'Demo-Editor']);
  assert.equal(okta.calls.length, 1);
  t = 6000;
  await authz.accessFor('u1');
  assert.equal(okta.calls.length, 2);
});

test('requireScope allows, sets req.access, and denies with 403', async () => {
  const okta = fakeOkta({ ro: ['Demo-ReadOnly'], none: ['Everyone'] });
  const authz = createAuthz({ okta });
  const mw = authz.requireScope('read-only');

  const req = { oidc: { user: { sub: 'ro', name: 'R O', groups: ['Demo-ReadOnly'] } } };
  const res = fakeRes();
  let nextCalled = false;
  await mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.access.scope, 'read-only');
  assert.deepEqual(req.access.tokenGroups, ['Demo-ReadOnly']);

  const req2 = { oidc: { user: { sub: 'none', name: 'N O' } } };
  const res2 = fakeRes();
  let next2 = false;
  await mw(req2, res2, () => { next2 = true; });
  assert.equal(next2, false);
  assert.equal(res2.statusCode, 403);
  assert.match(res2.body, /no active demo access/i);
});
