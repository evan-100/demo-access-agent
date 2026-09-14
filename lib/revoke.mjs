import { OktaError } from './okta.mjs';
import { DEMO_GROUP_PREFIX } from './scopes.mjs';

export const MAX_REVOKE_ATTEMPTS = 5;

export async function revokeGrant({ grant, okta, ledger, reason, now = () => new Date() }) {
  if (!grant.group || !grant.group.startsWith(DEMO_GROUP_PREFIX)) {
    throw new Error(`refusing to modify non-demo group ${grant.group}`);
  }
  try {
    await okta.removeUserFromGroup(grant.groupId, grant.userId);
  } catch (err) {
    const alreadyRemoved = err instanceof OktaError && err.status === 404;
    if (!alreadyRemoved) {
      ledger.append({ type: 'revoke_failed', id: grant.id, at: now().toISOString(), error: err.message });
      throw err;
    }
  }
  ledger.append({ type: 'revoked', id: grant.id, at: now().toISOString(), reason });
}

export async function sweepExpired({ okta, ledger, now = () => new Date(), log = () => {} }) {
  const current = now();
  const due = ledger.grants().filter((g) => g.status === 'active' && new Date(g.expiresAt) <= current);
  const result = { revoked: [], failed: [], abandoned: [] };
  for (const grant of due) {
    if (grant.revokeAttempts >= MAX_REVOKE_ATTEMPTS) {
      ledger.append({ type: 'revoke_abandoned', id: grant.id, at: current.toISOString(), attempts: grant.revokeAttempts });
      log(`ABANDONED revoke of ${grant.id} after ${grant.revokeAttempts} attempts`);
      result.abandoned.push(grant.id);
      continue;
    }
    try {
      await revokeGrant({ grant, okta, ledger, reason: 'expired', now });
      result.revoked.push(grant.id);
      log(`revoked ${grant.id} (${grant.userLogin ?? grant.userId} from ${grant.group ?? grant.groupId})`);
    } catch (err) {
      result.failed.push(grant.id);
      log(`FAILED to revoke ${grant.id}: ${err.message}`);
    }
  }
  return result;
}
