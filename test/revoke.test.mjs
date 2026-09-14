import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revokeGrant, sweepExpired, MAX_REVOKE_ATTEMPTS } from '../lib/revoke.mjs';
import { OktaError } from '../lib/okta.mjs';
import { foldEvents } from '../lib/ledger.mjs';

function ledgerWith(events) {
  const all = [...events];
  return { events: all, append: (e) => all.push({ at: '2026-09-14T12:00:00.000Z', ...e }), grants: () => foldEvents(all) };
}
const grant = (id, expiresAt) => ({
  type: 'granted', id, at: '2026-09-14T10:00:00.000Z', userId: '00u1', groupId: 'gRO', group: 'Demo-ReadOnly', expiresAt,
});
const now = () => new Date('2026-09-14T12:00:00.000Z');

test('revokeGrant removes membership and appends revoked', async () => {
  const calls = [];
  const okta = { removeUserFromGroup: async (g, u) => { calls.push([g, u]); return null; } };
  const ledger = ledgerWith([grant('a', '2026-09-14T11:00:00.000Z')]);
  await revokeGrant({ grant: ledger.grants()[0], okta, ledger, reason: 'manual', now });
  assert.deepEqual(calls, [['gRO', '00u1']]);
  assert.equal(ledger.grants()[0].status, 'revoked');
  assert.equal(ledger.grants()[0].revokeReason, 'manual');
});

test('revokeGrant treats Okta 404 as already removed', async () => {
  const okta = { removeUserFromGroup: async () => { throw new OktaError('gone', { status: 404 }); } };
  const ledger = ledgerWith([grant('a', '2026-09-14T11:00:00.000Z')]);
  await revokeGrant({ grant: ledger.grants()[0], okta, ledger, reason: 'expired', now });
  assert.equal(ledger.grants()[0].status, 'revoked');
});

test('revokeGrant records revoke_failed and rethrows on other errors', async () => {
  const okta = { removeUserFromGroup: async () => { throw new OktaError('rate limited', { status: 429 }); } };
  const ledger = ledgerWith([grant('a', '2026-09-14T11:00:00.000Z')]);
  await assert.rejects(() => revokeGrant({ grant: ledger.grants()[0], okta, ledger, reason: 'expired', now }), /rate limited/);
  const g = ledger.grants()[0];
  assert.equal(g.status, 'active');
  assert.equal(g.revokeAttempts, 1);
  assert.equal(g.lastRevokeError, 'rate limited');
});

test('sweepExpired revokes only active grants whose expiry has passed', async () => {
  const removed = [];
  const okta = { removeUserFromGroup: async (g, u) => { removed.push(u); return null; } };
  const ledger = ledgerWith([
    grant('due', '2026-09-14T11:59:00.000Z'),
    grant('future', '2026-09-14T13:00:00.000Z'),
    grant('done', '2026-09-14T11:00:00.000Z'),
    { type: 'revoked', id: 'done', at: '2026-09-14T11:00:10.000Z', reason: 'expired' },
  ]);
  const result = await sweepExpired({ okta, ledger, now });
  assert.deepEqual(result, { revoked: ['due'], failed: [], abandoned: [] });
  assert.equal(removed.length, 1);
  assert.equal(ledger.grants().find((g) => g.id === 'future').status, 'active');
});

test('sweepExpired keeps going after a failure', async () => {
  let n = 0;
  const okta = { removeUserFromGroup: async () => { n += 1; if (n === 1) throw new OktaError('boom', { status: 500 }); return null; } };
  const ledger = ledgerWith([grant('a', '2026-09-14T11:00:00.000Z'), grant('b', '2026-09-14T11:00:00.000Z')]);
  const result = await sweepExpired({ okta, ledger, now });
  assert.deepEqual(result, { revoked: ['b'], failed: ['a'], abandoned: [] });
});

test('sweepExpired abandons a grant with 5 prior failed attempts without calling okta', async () => {
  const calls = [];
  const okta = { removeUserFromGroup: async (g, u) => { calls.push([g, u]); return null; } };
  const events = [grant('a', '2026-09-14T11:00:00.000Z')];
  for (let i = 0; i < MAX_REVOKE_ATTEMPTS; i += 1) {
    events.push({ type: 'revoke_failed', id: 'a', at: '2026-09-14T11:00:00.000Z', error: 'boom' });
  }
  const ledger = ledgerWith(events);
  const result = await sweepExpired({ okta, ledger, now });
  assert.deepEqual(result, { revoked: [], failed: [], abandoned: ['a'] });
  assert.deepEqual(calls, []);
  const g = ledger.grants().find((x) => x.id === 'a');
  assert.equal(g.status, 'failed');
  assert.equal(g.revokeReason, 'abandoned');
});

test('foldEvents on a revoke_abandoned event yields status failed', () => {
  const grants = foldEvents([
    grant('a', '2026-09-14T11:00:00.000Z'),
    { type: 'revoke_abandoned', id: 'a', at: '2026-09-14T12:00:00.000Z', attempts: 5 },
  ]);
  const a = grants.find((x) => x.id === 'a');
  assert.equal(a.status, 'failed');
  assert.equal(a.revokeReason, 'abandoned');
  assert.equal(a.revokedAt, null);
});

test('revokeGrant refuses to modify a non-demo group', async () => {
  const okta = { removeUserFromGroup: async () => { throw new Error('should not be called'); } };
  const ledger = ledgerWith([]);
  const badGrant = { id: 'a', userId: '00u1', groupId: 'gX', group: 'Everyone' };
  await assert.rejects(
    () => revokeGrant({ grant: badGrant, okta, ledger, reason: 'expired', now }),
    /refusing to modify non-demo group Everyone/,
  );
});
