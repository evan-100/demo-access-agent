import { pathToFileURL } from 'node:url';
import { loadDotEnv, loadConfig } from '../lib/config.mjs';
import { createOktaClient, OktaError } from '../lib/okta.mjs';
import { SCOPES, SCOPE_NAMES } from '../lib/scopes.mjs';

export const SEED_USERS = [
  { firstName: 'Ava', lastName: 'Chen', login: 'ava.chen@example.com', title: 'Account Executive' },
  { firstName: 'Marcus', lastName: 'Reid', login: 'marcus.reid@example.com', title: 'Solutions Engineer' },
  { firstName: 'Priya', lastName: 'Nair', login: 'priya.nair@example.com', title: 'Sales Development Representative' },
];

export async function seed({ okta, password, log = console.log }) {
  const result = { groups: [], users: [] };

  for (const name of SCOPE_NAMES) {
    const { group, description } = SCOPES[name];
    const existing = await okta.findGroupByName(group);
    if (existing) {
      log(`group ${group} exists (${existing.id})`);
    } else {
      const created = await okta.createGroup(group, `Demo Access Agent: ${description}`);
      log(`group ${group} created (${created.id})`);
    }
    result.groups.push(group);
  }

  for (const u of SEED_USERS) {
    try {
      const existing = await okta.getUser(u.login);
      log(`user ${u.login} exists (${existing.id}, ${existing.status})`);
    } catch (err) {
      if (!(err instanceof OktaError && err.status === 404)) throw err;
      const created = await okta.createUser({ ...u, email: u.login, password });
      log(`user ${u.login} created (${created.id}, ${created.status})`);
    }
    result.users.push(u.login);
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadDotEnv();
  const config = loadConfig();
  const password = process.env.SEED_USER_PASSWORD;
  if (!password) {
    console.error('SEED_USER_PASSWORD is required (must satisfy the org password policy: 8+ chars, upper, lower, number)');
    process.exit(2);
  }
  const okta = createOktaClient({ orgUrl: config.oktaOrgUrl, apiToken: config.oktaApiToken });
  seed({ okta, password }).then(
    (r) => console.log(`seed complete: ${r.groups.length} groups, ${r.users.length} users`),
    (err) => { console.error(`seed failed: ${err.message}`); process.exit(1); },
  );
}
