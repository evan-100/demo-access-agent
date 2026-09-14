import { randomUUID } from 'node:crypto';
import { groupForScope } from './scopes.mjs';
import { validateIntent } from './intent.mjs';

export class GrantError extends Error {
  constructor(message, { intent } = {}) {
    super(message);
    this.name = 'GrantError';
    this.intent = intent ?? null;
  }
}

export function rosterFromUsers(users) {
  return users.map((u) => ({
    id: u.id,
    login: u.profile.login,
    name: `${u.profile.firstName ?? ''} ${u.profile.lastName ?? ''}`.trim(),
    title: u.profile.title ?? '',
  }));
}

export async function grantAccess({ prompt, okta, ledger, parse, now = () => new Date(), maxDurationMinutes = 1440 }) {
  const requestedAt = now();
  const roster = rosterFromUsers(await okta.listUsers());
  const intent = await parse({ prompt, roster, now: requestedAt });

  const problems = validateIntent(intent, { maxDurationMinutes });
  if (problems.length) throw new GrantError(`Cannot grant: ${problems.join('; ')}`, { intent });

  const user = roster.find((u) => u.id === intent.user_id);
  if (!user) throw new GrantError(`Parsed user id ${intent.user_id} is not in the active roster`, { intent });

  const groupName = groupForScope(intent.scope);
  const group = await okta.findGroupByName(groupName);
  if (!group) throw new GrantError(`Okta group ${groupName} not found. Run: npm run seed`, { intent });

  const existing = ledger.grants().find((g) => g.status === 'active' && g.userId === user.id && g.groupId === group.id);
  if (existing) ledger.append({ type: 'revoked', id: existing.id, at: now().toISOString(), reason: 'superseded' });

  await okta.addUserToGroup(group.id, user.id);
  const grantedAt = now();
  const expiresAt = new Date(grantedAt.getTime() + intent.duration_minutes * 60_000);

  const grant = {
    type: 'granted',
    id: randomUUID(),
    at: grantedAt.toISOString(),
    prompt,
    userId: user.id,
    userLogin: user.login,
    userName: user.name,
    scope: intent.scope,
    group: groupName,
    groupId: group.id,
    module: intent.module,
    durationMinutes: intent.duration_minutes,
    requestedAt: requestedAt.toISOString(),
    grantedAt: grantedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    provisioningMs: grantedAt.getTime() - requestedAt.getTime(),
  };
  ledger.append(grant);
  return grant;
}
