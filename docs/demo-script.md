# Demo script

Before recording, set `SWEEP_INTERVAL_MS=5000` in `.env` (down from the default 15000 ms) so the sweeper polls fast enough that expiry visibly fires on camera within the 2-minute recording, and issue a 2-minute grant duration rather than the default long-lived one used in normal usage. Restart the sweeper and app after changing `.env` so they pick up the new value. Restore `SWEEP_INTERVAL_MS` to its normal value after recording.

## Shot list (2 minutes)

```
0:00  Terminal A: `npm run sweeper` (show "sweep done: 0 revoked")
0:10  Terminal B: `npm run app`; browser: http://localhost:3000 -> Log in as ava.chen@example.com -> Okta refuses ("not assigned")
0:30  Terminal C: `npm run grant -- "Give the AE demo access for 2 minutes, read-only on the CRM module"` -> GRANTED, provisioning ms shown
0:45  Browser: log in again -> Dashboard, CRM Records (read-only badges), Settings -> Access denied; access panel shows live scope + token claim
1:15  Terminal C: `npm run grant -- "Actually Ava needs editor access for 2 minutes"` -> new grant; browser refresh -> Edit buttons appear (no re-login)
1:35  Wait for expiry; Terminal A prints "revoked ..."; browser refresh -> Access denied (no active demo access)
1:50  Terminal C: `npm run metrics` -> provisioning median, cleanup rate 100%
```
