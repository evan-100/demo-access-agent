# Demo Access Agent

An AI agent that grants and auto-revokes time-boxed, scoped demo-environment access for an existing employee through Okta, from one natural-language prompt. It models the real enterprise pattern of JIT/ephemeral access governance (Okta Identity Governance, Opal, ConductorOne) at proof-of-concept scale, and it operates on existing identities only — no new accounts are created, so there is zero marginal license cost.

## How it works

```
Natural-language prompt
  -> agent/cli.mjs (Claude structured output, roster-grounded intent parsing)
    -> Okta Groups API (PUT /groups/{g}/users/{u})
      -> ledger data/grants.jsonl (append-only grant record with TTL)
        -> agent/sweeper.mjs (polls the ledger, DELETE at expiry)
          -> Demo Platform (app/server.mjs)
             OIDC login restricted to Demo-* groups
             per-request live membership check gates pages/actions
```

`agent/cli.mjs` parses the prompt with Claude, resolves the named employee against the live Okta roster, and adds them to a scoped `Demo-*` Okta group. The grant (with its expiry) is appended to the JSONL ledger, which is the source of truth for time-boxed access — Okta group membership itself has no expiry field on the free tier. `agent/sweeper.mjs` polls that ledger and removes expired memberships from Okta. `app/server.mjs` gates every page with a live Okta membership lookup rather than trusting the OIDC token's `groups` claim, so a revocation becomes visible without waiting for the user to log in again.

## Scope tiers

| Tier | Okta group | Unlocks |
| --- | --- | --- |
| `read-only` | `Demo-ReadOnly` | View the dashboard and CRM records |
| `editor` | `Demo-Editor` | Read-only, plus edit controls on CRM records |
| `admin` | `Demo-Admin` | Editor, plus the settings page |

## Setup

1. Install Node 24 or later.
2. `npm install`
3. Sign up for an Okta **Integrator Free Plan** org at https://developer.okta.com/signup/.
4. Create an API token: Admin Console -> Security -> API -> Tokens. Note that it is an SSWS token that expires after 30 days of no use.
5. Copy `.env.example` to `.env` and fill in every variable:
   - `OKTA_ORG_URL`, `OKTA_API_TOKEN` — your org and the token from step 4.
   - `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` — Claude API key (or run `ant auth login` and leave the key blank); default model is `claude-opus-5`.
   - `OKTA_CLIENT_ID`, `OKTA_CLIENT_SECRET`, `APP_PORT`, `APP_BASE_URL`, `APP_SESSION_SECRET` — from the OIDC app you create in step 6 (`APP_SESSION_SECRET` via `openssl rand -hex 32`).
   - `SEED_USER_PASSWORD` — a password satisfying Okta's default policy, used for the seeded test employees.
   - `LEDGER_PATH`, `SWEEP_INTERVAL_MS`, `AUTHZ_CACHE_MS`, `MAX_DURATION_MINUTES` — agent tuning; the defaults in `.env.example` are sensible for a demo.
6. `npm run seed` — creates the three `Demo-*` groups and three test employees (`ava.chen@example.com`, `marcus.reid@example.com`, `priya.nair@example.com`) if they do not already exist.
7. Create an OIDC Web Application in the Okta Admin Console:
   - Sign-in redirect URI: `http://localhost:3000/callback`
   - Sign-out redirect URI: `http://localhost:3000`
   - Assignment limited to the three `Demo-*` groups only (so an employee with no active grant cannot log in at all)
   - On the app's Sign On tab, add a groups claim filter: name `groups`, filter "Starts with" `Demo-`
8. `npm run doctor` — verifies env vars, the Okta token, the three groups, the three seed users, ledger writability, and the app's OIDC config.

**Known Okta/library interop issue.** `app/server.mjs` sets `clientAuthMethod: 'client_secret_post'` deliberately. Without it, login fails with `invalid_client: The client secret supplied for a confidential client is invalid` for any Okta client secret containing `-`, `_`, `.`, `!`, `~`, `*`, `'`, `(`, or `)` — which is most Okta secrets, since Okta generates them with hyphens. The underlying cause: `express-openid-connect` calls `oauth4webapi`'s `client_secret_basic`, which percent-encodes those characters per RFC 6749 Appendix B before Base64-encoding the Basic-auth header; Okta's token endpoint does not decode that encoding back out, so it compares a corrupted secret and rejects it. `client_secret_post` sends the raw secret in the POST body instead, which Okta accepts. If you ever remove or change `clientAuthMethod`, retest login with a secret that contains a hyphen.

## Usage

Run these in three terminals:

```bash
npm run sweeper                 # Terminal A: polls the ledger, revokes expired grants
npm run app                     # Terminal B: the OIDC-gated demo platform (http://localhost:3000)
npm run grant -- "Give the AE demo access for 2 hours, read-only on the CRM module"   # Terminal C
```

Other commands:

```bash
npm run grants                  # list all grants and their status
npm run revoke -- <id>          # manually revoke a grant by id (or id prefix)
npm run metrics                 # provisioning time, cleanup rate
npm run eval                    # permission-scope / intent accuracy against fixture cases
```

## Tests

`npm test` runs the unit suite — no credentials needed, since every network module (Okta, Anthropic) takes an injected fake. `npm run eval` is the only test that calls Claude.

## Design notes

- **TTL lives in the ledger, not Okta.** Okta group membership has no expiry field on the free tier (time-bound access is a paid Okta Identity Governance feature), so the agent tracks expiry itself in the append-only `data/grants.jsonl` ledger. That ledger doubles as the audit log.
- **Live authorization, not just the OIDC token.** Group claims in an ID token only refresh on a new login, so a revocation would otherwise stay invisible until the user logged in again. The app displays the token's `groups` claim (to show the real OIDC pattern) but authorizes every request against a live Okta membership lookup, cached briefly for performance. A revocation becomes visible within one sweep interval plus the cache TTL, not instantly, which is a real and worth-discussing design tradeoff.
- **Three scope tiers instead of one.** A single `Demo-ReadOnly` group would make "permission-scope accuracy" a meaningless metric, since there would be only one possible answer. The agent instead defines `read-only`, `editor`, and `admin` tiers so scope selection is a real judgment call for the intent parser.
- **Roster-grounded parsing.** Rather than parsing a free-text employee name and then searching Okta, the agent first fetches the small active-user roster and hands it to Claude, which returns a specific Okta user id or `null`. This lets a reference like "the AE" resolve via the employee's Okta `title` attribute and turns ambiguity into a structured, checkable field instead of a guess.
- **Login itself is access-gated.** The OIDC application is assigned only to the three `Demo-*` groups, so an employee with no active grant cannot log in at all — Okta refuses at the identity-provider level. This is stronger than hiding pages after login and costs nothing extra to configure.
- **No HTTP API for the agent.** The CLI writes directly to the JSONL ledger and the sweeper runs as its own process reading the same file. An append-only file lets both writers operate safely without needing a lock or a database.

## Limits and what production would need

- **SSWS token, not OAuth.** The agent authenticates to Okta with a static SSWS admin token. A production system would use OAuth 2.0 with private-key JWT client authentication and scoped API access instead of a long-lived bearer token.
- **No approval workflow.** Every parsed request is granted immediately. Real JIT access governance (Okta Identity Governance, Opal, ConductorOne) typically inserts an approval step before provisioning.
- **Single system, no SCIM.** This agent only touches Okta group membership. A production version provisioning multiple downstream systems would need SCIM or a system of record to fan out grants and revocations consistently.
- **JSONL ledger, not a database.** The append-only file is fine at this scale but has no concurrent-writer guarantees beyond simple appends, no indexing, and no built-in retention policy.
- **Okta Integrator Free Plan constraints.** The org allows 10 active users and only 3 seeded test employees, and deactivates itself after 90 consecutive days with no sign-ins.
- **No rate-limit handling.** Okta and Anthropic API rate limits are not specifically retried or backed off; a production agent would need that for reliability under load.

## Metrics

| Metric | Value | Measured on |
| --- | --- | --- |
| Provisioning time (median) | pending first measured run | — |
| Provisioning time (p95) | pending first measured run | — |
| Expired-access cleanup rate | pending first measured run | — |
| Permission-scope accuracy | pending first measured run | — |

## License

MIT. See [LICENSE](LICENSE).
