import Anthropic from '@anthropic-ai/sdk';
import { loadDotEnv, loadConfig } from '../lib/config.mjs';
import { createOktaClient } from '../lib/okta.mjs';
import { createLedger } from '../lib/ledger.mjs';
import { parseIntent } from '../lib/intent.mjs';
import { grantAccess, GrantError } from '../lib/grant.mjs';
import { revokeGrant } from '../lib/revoke.mjs';

const USAGE = `Usage:
  node agent/cli.mjs grant "<natural-language request>"
  node agent/cli.mjs list
  node agent/cli.mjs revoke <grantId>`;

function fmt(iso) {
  return iso ? new Date(iso).toLocaleString() : '-';
}

function printGrant(g) {
  console.log(`  id:        ${g.id}`);
  console.log(`  employee:  ${g.userName} <${g.userLogin}>`);
  console.log(`  scope:     ${g.scope}  (Okta group ${g.group})`);
  console.log(`  window:    ${fmt(g.grantedAt)} -> ${fmt(g.expiresAt)}  (${g.durationMinutes} min)`);
  console.log(`  status:    ${g.status ?? 'active'}${g.revokeReason ? ` (${g.revokeReason} at ${fmt(g.revokedAt)})` : ''}`);
  console.log(`  provision: ${g.provisioningMs} ms`);
}

async function main(argv) {
  loadDotEnv();
  const config = loadConfig();
  const okta = createOktaClient({ orgUrl: config.oktaOrgUrl, apiToken: config.oktaApiToken });
  const ledger = createLedger(config.ledgerPath);
  const [command, ...rest] = argv;

  if (command === 'grant') {
    const prompt = rest.join(' ').trim();
    if (!prompt) { console.error(USAGE); return 2; }
    const client = new Anthropic();
    const parse = (args) => parseIntent({ ...args, client, model: config.anthropicModel });
    console.log(`Request: ${prompt}`);
    const grant = await grantAccess({ prompt, okta, ledger, parse, maxDurationMinutes: config.maxDurationMinutes });
    console.log('GRANTED');
    printGrant(grant);
    return 0;
  }

  if (command === 'list') {
    const grants = ledger.grants().sort((a, b) => a.grantedAt.localeCompare(b.grantedAt));
    if (!grants.length) { console.log('No grants yet.'); return 0; }
    for (const g of grants) { printGrant(g); console.log(''); }
    return 0;
  }

  if (command === 'revoke') {
    const [id] = rest;
    if (!id) { console.error(USAGE); return 2; }
    const matches = ledger.grants().filter((g) => g.id === id || g.id.startsWith(id));
    if (matches.length === 0) { console.error(`No grant with id ${id}`); return 1; }
    if (matches.length > 1) {
      console.error(`Ambiguous id prefix; matches: ${matches.map((g) => g.id).join(', ')}`);
      return 1;
    }
    const [grant] = matches;
    if (grant.status !== 'active') { console.error(`Grant ${grant.id} is already ${grant.status}`); return 1; }
    await revokeGrant({ grant, okta, ledger, reason: 'manual' });
    console.log(`REVOKED ${grant.id} (${grant.userLogin} removed from ${grant.group})`);
    return 0;
  }

  console.error(USAGE);
  return 2;
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (err) => {
    if (err instanceof GrantError) {
      console.error(`DENIED: ${err.message}`);
      if (err.intent) console.error(`  parsed intent: ${JSON.stringify(err.intent)}`);
    } else {
      console.error(`ERROR: ${err.message}`);
    }
    process.exit(1);
  },
);
