# Demo script

Before recording, set `SWEEP_INTERVAL_MS=5000` in `.env` (down from the default 15000 ms) so the sweeper polls fast enough that expiry visibly fires on camera within the 2-minute recording, and issue a 2-minute grant duration rather than the default long-lived one used in normal usage. Restart the sweeper and app after changing `.env` so they pick up the new value. Restore `SWEEP_INTERVAL_MS` to its normal value after recording.

## Shot list (2:30)

```
0:00  Terminal A: `npm run sweeper` (shows "sweep done: 0 revoked")
0:10  Terminal B: `npm run app`; browser http://localhost:3000 -> Log in as ava.chen@example.com -> Okta refuses (not assigned)
0:30  Terminal C: `npm run grant -- "Give the AE demo access for 1 minute, read-only on the CRM module"` -> GRANTED (provisioning ms shown)
0:45  Browser: log in -> Dashboard, CRM Records (read-only badges), Settings -> Access denied; access panel shows live scope + token claim
1:05  Terminal C: `npm run grant -- "Ava also needs editor access for 1 minute"` -> GRANTED; browser refresh -> Edit buttons appear without re-login (two memberships live, highest tier wins)
1:35  Terminal A prints "revoked ... Demo-ReadOnly"; browser refresh -> still editor (explain: the editor membership has its own expiry)
2:10  Terminal A prints "revoked ... Demo-Editor"; browser refresh -> Access denied (no active demo access)
2:20  Terminal C: `npm run metrics` -> provisioning median, cleanup rate 100%
```
