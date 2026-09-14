export const DEMO_GROUP_PREFIX = 'Demo-';

export const SCOPES = {
  'read-only': { group: 'Demo-ReadOnly', level: 1, description: 'View the dashboard and CRM records' },
  editor: { group: 'Demo-Editor', level: 2, description: 'Read-only plus edit CRM records' },
  admin: { group: 'Demo-Admin', level: 3, description: 'Editor plus the settings page' },
};

export const SCOPE_NAMES = Object.keys(SCOPES);

export const PAGES = { dashboard: 'read-only', records: 'read-only', settings: 'admin' };
export const ACTIONS = { editRecords: 'editor' };

export function groupForScope(scope) {
  const entry = SCOPES[scope];
  if (!entry) throw new Error(`Unknown scope: ${scope}`);
  return entry.group;
}

export function scopeForGroup(groupName) {
  return SCOPE_NAMES.find((name) => SCOPES[name].group === groupName) ?? null;
}

export function highestScope(groupNames) {
  let best = null;
  for (const groupName of groupNames) {
    const scope = scopeForGroup(groupName);
    if (scope && (!best || SCOPES[scope].level > SCOPES[best].level)) best = scope;
  }
  return best;
}

export function canAccess(scope, required) {
  if (!scope || !SCOPES[scope] || !SCOPES[required]) return false;
  return SCOPES[scope].level >= SCOPES[required].level;
}
