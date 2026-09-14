import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function foldEvents(events) {
  const grants = new Map();
  for (const event of events) {
    if (event.type === 'granted') {
      grants.set(event.id, {
        ...event, status: 'active', revokedAt: null, revokeReason: null, revokeAttempts: 0, lastRevokeError: null,
      });
      continue;
    }
    const grant = grants.get(event.id);
    if (!grant) continue;
    if (event.type === 'revoked') {
      grant.status = event.reason === 'superseded' ? 'superseded' : 'revoked';
      grant.revokedAt = event.at;
      grant.revokeReason = event.reason;
    } else if (event.type === 'revoke_failed') {
      grant.revokeAttempts += 1;
      grant.lastRevokeError = event.error;
    }
  }
  return [...grants.values()];
}

export function createLedger(path) {
  return {
    path,
    append(event) {
      mkdirSync(dirname(path), { recursive: true });
      const line = JSON.stringify({ at: new Date().toISOString(), ...event });
      appendFileSync(path, `${line}\n`);
    },
    read() {
      if (!existsSync(path)) return [];
      return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    },
    grants() {
      return foldEvents(this.read());
    },
  };
}
