import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../lib/config.mjs';

const base = { OKTA_ORG_URL: 'https://x.okta.com/', OKTA_API_TOKEN: 'tok' };

test('loadConfig applies defaults and strips trailing slash', () => {
  const c = loadConfig(base);
  assert.equal(c.oktaOrgUrl, 'https://x.okta.com');
  assert.equal(c.anthropicModel, 'claude-opus-5');
  assert.equal(c.ledgerPath, 'data/grants.jsonl');
  assert.equal(c.sweepIntervalMs, 15000);
  assert.equal(c.authzCacheMs, 5000);
  assert.equal(c.maxDurationMinutes, 1440);
  assert.equal(c.app.port, 3000);
  assert.equal(c.app.baseUrl, 'http://localhost:3000');
});

test('loadConfig throws naming every missing required var', () => {
  assert.throws(() => loadConfig({}), /Missing required env: OKTA_ORG_URL, OKTA_API_TOKEN/);
});

test('loadConfig reads overrides', () => {
  const c = loadConfig({ ...base, ANTHROPIC_MODEL: 'claude-sonnet-5', SWEEP_INTERVAL_MS: '500', APP_PORT: '4000' });
  assert.equal(c.anthropicModel, 'claude-sonnet-5');
  assert.equal(c.sweepIntervalMs, 500);
  assert.equal(c.app.port, 4000);
  assert.equal(c.app.baseUrl, 'http://localhost:4000');
});

test('loadConfig throws on a non-numeric SWEEP_INTERVAL_MS', () => {
  assert.throws(
    () => loadConfig({ ...base, SWEEP_INTERVAL_MS: 'abc' }),
    /Invalid numeric env SWEEP_INTERVAL_MS/,
  );
});

test('loadConfig throws on a zero MAX_DURATION_MINUTES', () => {
  assert.throws(
    () => loadConfig({ ...base, MAX_DURATION_MINUTES: '0' }),
    /Invalid numeric env MAX_DURATION_MINUTES/,
  );
});
