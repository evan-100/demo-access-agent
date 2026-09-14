export function loadDotEnv(path = '.env') {
  try {
    process.loadEnvFile(path);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // no .env file; rely on the process environment
  }
}

function num(env, key, fallback) {
  const value = env[key];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric env ${key}: ${value}`);
  }
  return parsed;
}

export function loadConfig(env = process.env) {
  const required = ['OKTA_ORG_URL', 'OKTA_API_TOKEN'];
  const missing = required.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing required env: ${missing.join(', ')}`);

  const port = num(env, 'APP_PORT', 3000);
  return {
    oktaOrgUrl: env.OKTA_ORG_URL.replace(/\/+$/, ''),
    oktaApiToken: env.OKTA_API_TOKEN,
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-opus-5',
    ledgerPath: env.LEDGER_PATH || 'data/grants.jsonl',
    sweepIntervalMs: num(env, 'SWEEP_INTERVAL_MS', 15000),
    authzCacheMs: num(env, 'AUTHZ_CACHE_MS', 5000),
    maxDurationMinutes: num(env, 'MAX_DURATION_MINUTES', 1440),
    app: {
      port,
      baseUrl: env.APP_BASE_URL || `http://localhost:${port}`,
      clientId: env.OKTA_CLIENT_ID || '',
      clientSecret: env.OKTA_CLIENT_SECRET || '',
      sessionSecret: env.APP_SESSION_SECRET || '',
    },
  };
}
