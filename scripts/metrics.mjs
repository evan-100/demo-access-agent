import { loadDotEnv, loadConfig } from '../lib/config.mjs';
import { createLedger } from '../lib/ledger.mjs';
import { computeMetrics } from '../lib/metrics.mjs';

loadDotEnv();
const config = loadConfig();
const m = computeMetrics(createLedger(config.ledgerPath).grants(), { sweepIntervalMs: config.sweepIntervalMs });
const pct = (x) => `${(x * 100).toFixed(1)}%`;

console.log(`Grants: ${m.totalGrants} total, ${m.active} active`);
console.log('');
console.log('Provisioning time (prompt submitted -> Okta membership live)');
console.log(`  samples ${m.provisioning.count}  median ${m.provisioning.medianMs} ms  p95 ${m.provisioning.p95Ms} ms  max ${m.provisioning.maxMs} ms`);
console.log('');
console.log('Expired-access cleanup');
console.log(`  due ${m.cleanup.due}  revoked ${m.cleanup.revoked} (${m.cleanup.onTime} on time, ${m.cleanup.late} late)  outstanding ${m.cleanup.outstanding}  failed attempts ${m.cleanup.failedAttempts}`);
console.log(`  cleanup rate ${pct(m.cleanup.rate)}  (on time = within ${2 * config.sweepIntervalMs} ms of expiry)`);
console.log('');
console.log('Permission-scope accuracy: run `npm run eval`');
