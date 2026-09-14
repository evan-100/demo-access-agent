import { accessSync, constants, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadDotEnv, loadConfig } from '../lib/config.mjs';
import { createOktaClient, OktaError } from '../lib/okta.mjs';
import { SCOPES, SCOPE_NAMES } from '../lib/scopes.mjs';
import { SEED_USERS } from './seed.mjs';

const results = [];
const report = (level, msg) => { results.push(level); console.log(`${level.padEnd(4)} ${msg}`); };

loadDotEnv();
let config;
try {
  config = loadConfig();
  report('PASS', `env loaded (org ${config.oktaOrgUrl})`);
} catch (err) {
  report('FAIL', err.message);
  process.exit(1);
}

if (process.env.ANTHROPIC_API_KEY) report('PASS', 'ANTHROPIC_API_KEY set');
else report('WARN', 'ANTHROPIC_API_KEY not set; the SDK will fall back to an `ant auth login` profile if one exists');

const okta = createOktaClient({ orgUrl: config.oktaOrgUrl, apiToken: config.oktaApiToken });
try {
  const me = await okta.whoAmI();
  report('PASS', `Okta API token works (token owner ${me.profile.login})`);
} catch (err) {
  report('FAIL', `Okta API token rejected: ${err.message}`);
}

for (const name of SCOPE_NAMES) {
  const groupName = SCOPES[name].group;
  try {
    const g = await okta.findGroupByName(groupName);
    if (g) report('PASS', `group ${groupName} exists`);
    else report('FAIL', `group ${groupName} missing (run: npm run seed)`);
  } catch (err) {
    report('FAIL', `group lookup ${groupName}: ${err.message}`);
  }
}

for (const u of SEED_USERS) {
  try {
    const user = await okta.getUser(u.login);
    report(user.status === 'ACTIVE' ? 'PASS' : 'WARN', `user ${u.login} ${user.status}`);
  } catch (err) {
    if (err instanceof OktaError && err.status === 404) report('FAIL', `user ${u.login} missing (run: npm run seed)`);
    else report('FAIL', `user lookup ${u.login}: ${err.message}`);
  }
}

try {
  mkdirSync(dirname(config.ledgerPath), { recursive: true });
  accessSync(dirname(config.ledgerPath), constants.W_OK);
  report('PASS', `ledger directory writable (${config.ledgerPath})`);
} catch (err) {
  report('FAIL', `ledger directory not writable: ${err.message}`);
}

const appKeys = ['clientId', 'clientSecret', 'sessionSecret'].filter((k) => !config.app[k]);
if (appKeys.length) report('WARN', `demo app not configured yet (missing ${appKeys.join(', ')}); see Task 10`);
else report('PASS', 'demo app OIDC config present');

const failed = results.filter((r) => r === 'FAIL').length;
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
