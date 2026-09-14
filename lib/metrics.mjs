export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function computeMetrics(grants, { now = new Date(), sweepIntervalMs = 15000 } = {}) {
  const provisioning = grants.map((g) => g.provisioningMs).filter(Number.isFinite).sort((a, b) => a - b);

  const due = grants.filter((g) => g.status !== 'superseded' && g.revokeReason !== 'manual' && new Date(g.expiresAt) <= now);
  const revokedGrants = due.filter((g) => g.status === 'revoked');
  const onTime = revokedGrants.filter((g) => new Date(g.revokedAt) - new Date(g.expiresAt) <= 2 * sweepIntervalMs).length;

  return {
    totalGrants: grants.length,
    active: grants.filter((g) => g.status === 'active').length,
    provisioning: {
      count: provisioning.length,
      medianMs: percentile(provisioning, 50),
      p95Ms: percentile(provisioning, 95),
      maxMs: provisioning.at(-1) ?? 0,
    },
    cleanup: {
      due: due.length,
      revoked: revokedGrants.length,
      onTime,
      late: revokedGrants.length - onTime,
      outstanding: due.length - revokedGrants.length,
      failedAttempts: grants.reduce((sum, g) => sum + (g.revokeAttempts ?? 0), 0),
      rate: due.length ? revokedGrants.length / due.length : 1,
    },
  };
}
