import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grantAccess, GrantError, rosterFromUsers } from '../lib/grant.mjs';

const users = [
  { id: '00uAE', profile: { login: 'ava@x.com', firstName: 'Ava', lastName: 'Chen', title: 'Account Executive' } },
  { id: '00uSE', profile: { login: 'marcus@x.com', firstName: 'Marcus', lastName: 'Reid' } },
];

function fakeOkta({ group = { id: 'gRO', profile: { name: 'Demo-ReadOnly' } } } = {}) {
  const calls = [];
  return {
    calls,
    listUsers: async () => users,
    findGroupByName: async (name) => (group && group.profile.name === name ? group : null),
    addUserToGroup: async (groupId, userId) => { calls.push(['add', groupId, userId]); return null; },
  };
}

function fakeLedger(initial = []) {
  const events = [...initial];
  return {
    events,
    append: (e) => events.push({ at: '2026-09-14T10:00:00.000Z', ...e }),
    grants: () => events
      .filter((e) => e.type === 'granted')
      .map((e) => ({ ...e, status: events.some((r) => r.type === 'revoked' && r.id === e.id) ? 'revoked' : 'active' })),
  };
}

const clock = (() => { let t = Date.parse('2026-09-14T10:00:00.000Z'); return () => new Date((t += 500)); })();

test('rosterFromUsers flattens Okta users', () => {
  assert.deepEqual(rosterFromUsers(users)[1], { id: '00uSE', login: 'marcus@x.com', name: 'Marcus Reid', title: '' });
});

test('grantAccess adds the user to the scoped group and records a granted event', async () => {
  const okta = fakeOkta();
  const ledger = fakeLedger();
  let seenRoster;
  const parse = async ({ roster }) => { seenRoster = roster; return { user_id: '00uAE', scope: 'read-only', duration_minutes: 120, module: 'crm', ambiguity: null }; };
  const grant = await grantAccess({ prompt: 'Give the AE 2h read-only', okta, ledger, parse, now: clock });
  assert.equal(seenRoster.length, 2);
  assert.deepEqual(okta.calls, [['add', 'gRO', '00uAE']]);
  assert.equal(grant.type, 'granted');
  assert.equal(grant.group, 'Demo-ReadOnly');
  assert.equal(grant.userLogin, 'ava@x.com');
  assert.equal(grant.durationMinutes, 120);
  assert.equal(new Date(grant.expiresAt) - new Date(grant.grantedAt), 120 * 60 * 1000);
  assert.ok(grant.provisioningMs > 0);
  assert.equal(ledger.events.at(-1).id, grant.id);
});

test('grantAccess rejects an invalid intent without touching Okta', async () => {
  const okta = fakeOkta();
  const parse = async () => ({ user_id: null, scope: 'read-only', duration_minutes: 10, module: null, ambiguity: 'two matches' });
  await assert.rejects(
    () => grantAccess({ prompt: 'x', okta, ledger: fakeLedger(), parse }),
    (err) => err instanceof GrantError && /two matches/.test(err.message) && err.intent.ambiguity === 'two matches',
  );
  assert.deepEqual(okta.calls, []);
});

test('grantAccess fails clearly when the group is missing', async () => {
  const okta = fakeOkta({ group: null });
  const parse = async () => ({ user_id: '00uAE', scope: 'read-only', duration_minutes: 10, module: null, ambiguity: null });
  await assert.rejects(() => grantAccess({ prompt: 'x', okta, ledger: fakeLedger(), parse }), /Demo-ReadOnly not found/);
});

test('grantAccess supersedes an existing active grant for the same user and group', async () => {
  const okta = fakeOkta();
  const ledger = fakeLedger([{ type: 'granted', id: 'old', userId: '00uAE', groupId: 'gRO', at: '2026-09-14T09:00:00.000Z' }]);
  const parse = async () => ({ user_id: '00uAE', scope: 'read-only', duration_minutes: 10, module: null, ambiguity: null });
  await grantAccess({ prompt: 'x', okta, ledger, parse });
  const superseded = ledger.events.find((e) => e.type === 'revoked' && e.id === 'old');
  assert.equal(superseded.reason, 'superseded');
});
