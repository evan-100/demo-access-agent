import { OktaError } from './okta.mjs';

export async function revokeGrant({ grant, okta, ledger, reason, now = () => new Date() }) {
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
  const result = { revoked: [], failed: [] };
  for (const grant of due) {
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
