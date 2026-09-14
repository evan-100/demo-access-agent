import { auth } from 'express-openid-connect';
import { loadDotEnv, loadConfig } from '../lib/config.mjs';
import { createOktaClient } from '../lib/okta.mjs';
import { createAuthz } from './authz.mjs';
import { createApp } from './routes.mjs';

loadDotEnv();
const config = loadConfig();
for (const key of ['clientId', 'clientSecret', 'sessionSecret']) {
  if (!config.app[key]) {
    console.error('Missing app config: set OKTA_CLIENT_ID, OKTA_CLIENT_SECRET and APP_SESSION_SECRET in .env (see Task 10 in the plan)');
    process.exit(2);
  }
}

const okta = createOktaClient({ orgUrl: config.oktaOrgUrl, apiToken: config.oktaApiToken });
const authz = createAuthz({ okta, ttlMs: config.authzCacheMs });

const authMiddleware = auth({
  issuerBaseURL: config.oktaOrgUrl,
  baseURL: config.app.baseUrl,
  clientID: config.app.clientId,
  clientSecret: config.app.clientSecret,
  secret: config.app.sessionSecret,
  authRequired: false,
  idpLogout: true,
  authorizationParams: { response_type: 'code', scope: 'openid profile email groups' },
});

const app = createApp({ authMiddleware, authz });
app.listen(config.app.port, () => {
  console.log(`Demo Platform listening on ${config.app.baseUrl} (issuer ${config.oktaOrgUrl}, authz cache ${config.authzCacheMs} ms)`);
});
