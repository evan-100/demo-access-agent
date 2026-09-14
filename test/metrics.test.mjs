import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics, percentile } from '../lib/metrics.mjs';

const g = (over) => ({ id: 'x', status: 'active', provisioningMs: 1000, expiresAt: '2026-09-14T11:00:00.000Z', revokedAt: null, revokeReason: null, revokeAttempts: 0, ...over });
const now = new Date('2026-09-14T12:00:00.000Z');

test('percentile on a sorted array', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
  assert.equal(percentile([1, 2, 3, 4, 5], 95), 5);
  assert.equal(percentile([], 50), 0);
});

test('computeMetrics summarises provisioning and cleanup', () => {
  const grants = [
    g({ id: 'a', status: 'revoked', revokeReason: 'expired', revokedAt: '2026-09-14T11:00:10.000Z', provisioningMs: 800 }),
    g({ id: 'b', status: 'revoked', revokeReason: 'expired', revokedAt: '2026-09-14T11:05:00.000Z', provisioningMs: 1200 }),
    g({ id: 'c', status: 'active', revokeAttempts: 2, provisioningMs: 3000 }),
    g({ id: 'd', status: 'superseded', revokeReason: 'superseded', revokedAt: '2026-09-14T10:30:00.000Z' }),
    g({ id: 'e', status: 'revoked', revokeReason: 'manual', revokedAt: '2026-09-14T10:30:00.000Z' }),
    g({ id: 'f', status: 'active', expiresAt: '2026-09-14T13:00:00.000Z' }),
  ];
  const m = computeMetrics(grants, { now, sweepIntervalMs: 15000 });
  assert.equal(m.totalGrants, 6);
  assert.equal(m.active, 2);
  assert.equal(m.provisioning.count, 6);
  assert.equal(m.provisioning.medianMs, 1000);
  assert.equal(m.provisioning.maxMs, 3000);
  assert.deepEqual(m.cleanup, { due: 3, revoked: 2, onTime: 1, late: 1, outstanding: 1, failedAttempts: 2, rate: 2 / 3 });
});

test('computeMetrics with nothing due reports rate 1', () => {
  assert.equal(computeMetrics([], { now }).cleanup.rate, 1);
});

test('a failed (abandoned) grant past expiry counts as due and outstanding, not revoked', () => {
  const grants = [g({ id: 'z', status: 'failed', revokeReason: 'abandoned', revokedAt: null })];
  const m = computeMetrics(grants, { now, sweepIntervalMs: 15000 });
  assert.equal(m.cleanup.due, 1);
  assert.equal(m.cleanup.revoked, 0);
  assert.equal(m.cleanup.outstanding, 1);
});
