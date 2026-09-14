import { DEMO_GROUP_PREFIX, canAccess, highestScope } from '../lib/scopes.mjs';
import { denied } from './views.mjs';

export function createAuthz({ okta, ttlMs = 5000, now = () => Date.now() }) {
  const cache = new Map();

  async function accessFor(userId) {
    const hit = cache.get(userId);
    if (hit && now() - hit.checkedAt < ttlMs) return hit;
    const groups = (await okta.listUserGroups(userId))
      .map((g) => g.profile.name)
      .filter((name) => name.startsWith(DEMO_GROUP_PREFIX));
    const entry = { scope: highestScope(groups), groups, checkedAt: now() };
    cache.set(userId, entry);
    return entry;
  }

  function requireScope(required) {
    return async (req, res, next) => {
      try {
        const user = req.oidc.user;
        const { scope, groups } = await accessFor(user.sub);
        req.access = { scope, groups, tokenGroups: user.groups ?? [] };
        if (!canAccess(scope, required)) {
          res.status(403).send(denied({ user, access: req.access, required }));
          return;
        }
        next();
      } catch (err) {
        next(err);
      }
    };
  }

  return { accessFor, requireScope, clear: () => cache.clear() };
}
