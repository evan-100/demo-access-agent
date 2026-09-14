import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOktaClient, OktaError } from '../lib/okta.mjs';

function fakeFetch(handler) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body });
    const r = handler(String(url), init);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)),
    };
  };
  return { fetchFn, calls };
}

const base = { orgUrl: 'https://x.okta.com', apiToken: 'tok' };

test('sends SSWS auth header and api/v1 prefix', async () => {
  const { fetchFn, calls } = fakeFetch(() => ({ status: 200, body: { id: '00u1' } }));
  const okta = createOktaClient({ ...base, fetchFn });
  const me = await okta.whoAmI();
  assert.equal(me.id, '00u1');
  assert.equal(calls[0].url, 'https://x.okta.com/api/v1/users/me');
  assert.equal(calls[0].headers.Authorization, 'SSWS tok');
});

test('listUsers filters to ACTIVE', async () => {
  const { fetchFn, calls } = fakeFetch(() => ({ status: 200, body: [] }));
  await createOktaClient({ ...base, fetchFn }).listUsers();
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/v1/users');
  assert.equal(url.searchParams.get('filter'), 'status eq "ACTIVE"');
  assert.equal(url.searchParams.get('limit'), '200');
});

test('findGroupByName returns exact match only', async () => {
  const { fetchFn } = fakeFetch(() => ({
    status: 200,
    body: [{ id: 'g1', profile: { name: 'Demo-ReadOnly-Old' } }, { id: 'g2', profile: { name: 'Demo-ReadOnly' } }],
  }));
  const okta = createOktaClient({ ...base, fetchFn });
  assert.equal((await okta.findGroupByName('Demo-ReadOnly')).id, 'g2');
  assert.equal(await okta.findGroupByName('Demo-Nope'), null);
});

test('addUserToGroup PUTs and returns null on 204', async () => {
  const { fetchFn, calls } = fakeFetch(() => ({ status: 204 }));
  const result = await createOktaClient({ ...base, fetchFn }).addUserToGroup('g2', '00u1');
  assert.equal(result, null);
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].url, 'https://x.okta.com/api/v1/groups/g2/users/00u1');
});

test('removeUserFromGroup DELETEs', async () => {
  const { fetchFn, calls } = fakeFetch(() => ({ status: 204 }));
  await createOktaClient({ ...base, fetchFn }).removeUserFromGroup('g2', '00u1');
  assert.equal(calls[0].method, 'DELETE');
});

test('createUser posts profile + credentials with activate=true', async () => {
  const { fetchFn, calls } = fakeFetch(() => ({ status: 200, body: { id: '00u9' } }));
  await createOktaClient({ ...base, fetchFn }).createUser({
    firstName: 'Ava', lastName: 'Chen', email: 'ava@example.com', login: 'ava@example.com',
    title: 'Account Executive', password: 'Pw-123456!',
  });
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get('activate'), 'true');
  const body = JSON.parse(calls[0].body);
  assert.equal(body.profile.title, 'Account Executive');
  assert.equal(body.credentials.password.value, 'Pw-123456!');
});

test('non-2xx throws OktaError with status and errorSummary', async () => {
  const { fetchFn } = fakeFetch(() => ({ status: 404, body: { errorSummary: 'Not found: Resource not found' } }));
  await assert.rejects(
    () => createOktaClient({ ...base, fetchFn }).getUser('nobody'),
    (err) => err instanceof OktaError && err.status === 404 && /Resource not found/.test(err.message),
  );
});

test('non-JSON error response throws OktaError with raw body', async () => {
  const fetchFn = async () => ({
    ok: false,
    status: 502,
    text: async () => '<html>Bad Gateway</html>',
  });
  await assert.rejects(
    () => createOktaClient({ ...base, fetchFn }).whoAmI(),
    (err) => err instanceof OktaError && err.status === 502 && /Bad Gateway/.test(err.body.raw),
  );
});
