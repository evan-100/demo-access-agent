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
    } else if (event.type === 'revoke_abandoned') {
      grant.status = 'failed';
      grant.revokeReason = 'abandoned';
    }
  }
  return [...grants.values()];
}

export function createLedger(path, { warn = console.warn } = {}) {
  return {
    path,
    append(event) {
      mkdirSync(dirname(path), { recursive: true });
      const line = JSON.stringify({ at: new Date().toISOString(), ...event });
      appendFileSync(path, `${line}\n`);
    },
    read() {
      if (!existsSync(path)) return [];
      const lines = readFileSync(path, 'utf8').split('\n');
      const events = [];
      lines.forEach((line, index) => {
        if (!line) return;
        try {
          events.push(JSON.parse(line));
        } catch {
          warn(`ledger: skipping corrupt line ${index + 1} in ${path}`);
        }
      });
      return events;
    },
    grants() {
      return foldEvents(this.read());
    },
  };
}
