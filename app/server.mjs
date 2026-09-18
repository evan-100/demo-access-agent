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
  // Okta's client secrets commonly contain '-'/'_'; RFC 6749 Appendix B's
  // form-url-encoding for client_secret_basic (used by oauth4webapi, which
  // express-openid-connect calls internally) percent-encodes those before
  // Base64, and Okta's token endpoint does not decode that back out, so
  // login fails with invalid_client for any secret containing one of those
  // characters. client_secret_post sends the raw secret in the POST body
  // instead, and Okta accepts it regardless of the app's declared
  // token_endpoint_auth_method.
  clientAuthMethod: 'client_secret_post',
  authorizationParams: { response_type: 'code', scope: 'openid profile email groups' },
});

const app = createApp({ authMiddleware, authz });
app.listen(config.app.port, () => {
  console.log(`Demo Platform listening on ${config.app.baseUrl} (issuer ${config.oktaOrgUrl}, authz cache ${config.authzCacheMs} ms)`);
});
