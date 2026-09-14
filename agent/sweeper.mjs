import { loadDotEnv, loadConfig } from '../lib/config.mjs';
import { createOktaClient } from '../lib/okta.mjs';
import { createLedger } from '../lib/ledger.mjs';
import { sweepExpired } from '../lib/revoke.mjs';

loadDotEnv();
const config = loadConfig();
const okta = createOktaClient({ orgUrl: config.oktaOrgUrl, apiToken: config.oktaApiToken });
const ledger = createLedger(config.ledgerPath);
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const active = ledger.grants().filter((g) => g.status === 'active').length;
    const result = await sweepExpired({ okta, ledger, log });
    log(`sweep done: ${result.revoked.length} revoked, ${result.failed.length} failed, ${active - result.revoked.length} still active`);
  } catch (err) {
    log(`sweep error: ${err.message}`);
  } finally {
    running = false;
  }
}

log(`sweeper started; interval ${config.sweepIntervalMs} ms; ledger ${config.ledgerPath}`);
await tick();
setInterval(tick, config.sweepIntervalMs);
