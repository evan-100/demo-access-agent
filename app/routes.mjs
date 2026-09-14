import express from 'express';
import { PAGES } from '../lib/scopes.mjs';
import { home, dashboard, records, settings } from './views.mjs';

function requireLogin(req, res, next) {
  if (req.oidc?.isAuthenticated()) return next();
  res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
}

export function createApp({ authMiddleware, authz }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(authMiddleware);

  app.get('/healthz', (req, res) => res.type('text').send('ok'));
  app.get('/', (req, res) => res.send(home({ user: req.oidc?.isAuthenticated() ? req.oidc.user : null })));

  const page = (required, view) => [
    requireLogin,
    authz.requireScope(required),
    (req, res) => res.send(view({ user: req.oidc.user, access: req.access })),
  ];
  app.get('/dashboard', ...page(PAGES.dashboard, dashboard));
  app.get('/records', ...page(PAGES.records, records));
  app.get('/settings', ...page(PAGES.settings, settings));

  return app;
}
