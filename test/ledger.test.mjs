import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLedger, foldEvents } from '../lib/ledger.mjs';

const granted = (id, extra = {}) => ({
  type: 'granted', id, at: '2026-09-14T10:00:00.000Z', prompt: 'p', userId: '00u1', userLogin: 'a@x.com',
  userName: 'A B', scope: 'read-only', group: 'Demo-ReadOnly', groupId: 'g1', module: null, durationMinutes: 60,
  requestedAt: '2026-09-14T09:59:59.000Z', grantedAt: '2026-09-14T10:00:00.000Z',
  expiresAt: '2026-09-14T11:00:00.000Z', provisioningMs: 1000, ...extra,
});

test('foldEvents builds grant state from events', () => {
  const grants = foldEvents([
    granted('a'),
    granted('b'),
    { type: 'revoke_failed', id: 'a', at: '2026-09-14T11:00:05.000Z', error: 'boom' },
    { type: 'revoked', id: 'a', at: '2026-09-14T11:00:20.000Z', reason: 'expired' },
    { type: 'revoked', id: 'b', at: '2026-09-14T10:30:00.000Z', reason: 'superseded' },
    { type: 'revoked', id: 'missing', at: '2026-09-14T10:30:00.000Z', reason: 'manual' },
  ]);
  assert.equal(grants.length, 2);
  const a = grants.find((g) => g.id === 'a');
  assert.equal(a.status, 'revoked');
  assert.equal(a.revokedAt, '2026-09-14T11:00:20.000Z');
  assert.equal(a.revokeReason, 'expired');
  assert.equal(a.revokeAttempts, 1);
  assert.equal(a.lastRevokeError, 'boom');
  const b = grants.find((g) => g.id === 'b');
  assert.equal(b.status, 'superseded');
});

test('createLedger appends JSONL, reads back, and tolerates a missing file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-'));
  const ledger = createLedger(join(dir, 'nested', 'grants.jsonl'));
  assert.deepEqual(ledger.read(), []);
  assert.deepEqual(ledger.grants(), []);
  ledger.append(granted('a'));
  ledger.append({ type: 'revoked', id: 'a', reason: 'manual' });
  const lines = readFileSync(ledger.path, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  const events = ledger.read();
  assert.equal(events[1].type, 'revoked');
  assert.match(events[1].at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(ledger.grants()[0].status, 'revoked');
});
