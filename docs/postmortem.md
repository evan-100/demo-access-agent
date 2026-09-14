# Postmortem

## What was built

- An agent (`agent/cli.mjs`, `agent/sweeper.mjs`) that parses a natural-language demo-access request with Claude, resolves the employee against a live, roster-grounded Okta user lookup, grants one of three scoped `Demo-*` group memberships, records the grant with a TTL in an append-only JSONL ledger, and sweeps expired grants out of Okta on a polling interval.
- A small OIDC-gated demo platform (`app/server.mjs`) with a dashboard, CRM records, and settings page, whose sign-in is restricted to the three `Demo-*` groups and whose every request is authorized against a live (briefly cached) Okta membership check rather than a stale OIDC token claim.
- Supporting tooling: an idempotent seed script for the three test employees and groups, an environment/connectivity doctor script, a manual grant/list/revoke CLI, and metrics + intent-accuracy eval scripts to produce the numbers for the project's STAR+R "Result."

## What worked

- The append-only JSONL ledger as the single source of truth for TTL and grant history kept the CLI and the sweeper safe as two independent writers without any locking or database.
- Every module that touches the network (`lib/okta.mjs`, Claude calls) takes an injected `fetchFn`/client, which kept the full test suite (10 test files, `node --test`) able to run offline with no live Okta or Anthropic credentials.
- Roster-grounded intent parsing — handing Claude the small live employee roster instead of free-text name matching — turned "the AE" into a structured, checkable Okta user id rather than a guess.
- Gating login itself (not just pages) at the Okta application-assignment level meant an employee with no active grant is refused before the app ever sees a request.

## What did not / surprises

- Okta's free tier changed mid-plan: the brief assumed "Developer Edition (up to 100 users)," but new sign-ups now get the Integrator Free Plan (10 active users, org deactivated after 90 days with no sign-ins), which capped seeding at 3 test employees.
- OIDC group claims are only refreshed when a new ID token is issued, so a revocation would not be visible in the token until the user logged in again — a live Okta membership check on every request was required to make revocation actually visible in real time.
- Time-bound access ("TTL") has no home in Okta group membership on the free tier (it's a paid Okta Identity Governance feature), so the expiry had to live entirely outside Okta, in the agent's own ledger.

## What I'd do at real scale

- Replace the static SSWS admin token with OAuth 2.0 / private-key JWT client authentication for the Okta API integration.
- Add an approval step before a grant is provisioned, rather than granting every parsed request immediately.
- Extend beyond a single system with SCIM (or an equivalent) for multi-system provisioning, instead of touching only Okta group membership.
- Replace the JSONL ledger with a durable store and an exportable audit trail.
- Add alerting on `revoke_failed` so a failed sweep is never silent.
- Note Okta Identity Governance's access-request workflows as the managed, off-the-shelf alternative to this bespoke agent at real scale.

## Metrics

| Metric | Value | Measured on |
| --- | --- | --- |
| Provisioning time (median) | pending first measured run | — |
| Provisioning time (p95) | pending first measured run | — |
| Expired-access cleanup rate | pending first measured run | — |
| Permission-scope accuracy | pending first measured run | — |
