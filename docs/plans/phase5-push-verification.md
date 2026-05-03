---
created: 2026-05-01
status: in-progress
owner: matt
pairs-with: docs/plans/homestead-covey-migration.md
---

## Spec

Verify that all four push notification types render Covey brand copy — not Homestead copy — when `COVEY_BRAND_ACTIVE=true`, and that deep links and SW fallback work correctly. This is the final gate before Phase 6 cutover. No production flag flip until this passes on a real device.

**Four notification types to verify:**
1. **Lantern** — triggered by `POST /api/bell` → `notifyBellRing()`. Title: `🪔 <household> needs help`. Deep link: `/?tab=lantern`.
2. **Whistle** — triggered by `POST /api/shifts` → `notifyNewShift()`. Title: `📋 New Whistle — <household>`. Deep link: `/?tab=almanac`.
3. **Escalation** — triggered by `GET /api/bell/cron` (5-min automatic) → `notifyBellEscalated()`. Title: `🪔 Still needed — <reason>`. Deep link: `/?tab=lantern`.
4. **Covered-Whistle response** — triggered by claim (`/api/shifts/[id]/claim`) → `notifyShiftClaimed()`. Title: `✅ <name> covered it`. Deep link: `/?tab=almanac`.

**SW fallback test:**
When push payload JSON parse fails, the SW falls back to `{ title: 'Covey', body: event.data.text() }`. Cache version under `COVEY_BRAND_ACTIVE=true` is `covey-v2` (set in `app/api/sw-script/route.ts`).

**Success criteria (all must pass):**
- [ ] Lantern push title reads `🪔 <household> needs help` (Covey copy, not "Homestead")
- [ ] Whistle push title reads `📋 New Whistle — <household>` (Covey copy)
- [ ] Escalation push title reads `🪔 Still needed — <reason>` (Covey copy)
- [ ] Covered-Whistle push title reads `✅ <name> covered it` (Covey copy)
- [ ] Tapping Lantern / escalation notification opens `/?tab=lantern`
- [ ] Tapping Whistle / covered notification opens `/?tab=almanac`
- [ ] SW fallback shows "Covey" as title (not "Homestead")
- [ ] SW cache version header reads `covey-v2` (verify: `curl -I joincovey.co/sw.js | grep cache-version` or check SW console logs)
- [ ] iOS + Android both tested (or noted if only one available)

---

## File map

No code changes required — all copy is already gated behind `getCopy()`. This is a configuration + manual verification task.

| Surface | What to do |
|---|---|
| Vercel Preview env (sirmansco/homestead-app) | Add `COVEY_BRAND_ACTIVE=true` + `NEXT_PUBLIC_COVEY_BRAND_ACTIVE=true` to **Preview** scope only. Do NOT touch Production scope. |
| Vercel | Trigger a new preview deploy (push a no-op commit to a feature branch, or use Vercel dashboard Redeploy) |
| Browser devtools | On the preview URL, open Network tab → filter for `/api/bell`, `/api/shifts`, `/api/bell/cron`, `/api/shifts/[id]/claim` — inspect response bodies and server logs for `notifySent`/`notifyEligible` counts |
| Push log | Check Vercel runtime logs for `push_batch` JSON lines — confirm `delivered > 0` |
| Device | Real iOS or Android device with push permissions granted on the preview URL |

---

## How to set the preview env var (step by step)

1. Open Vercel dashboard → `homestead-app` project → Settings → Environment Variables
2. Find `COVEY_BRAND_ACTIVE` — it currently exists as Production=`false`. Add a new entry scoped to **Preview only**: value `true`.
3. Same for `NEXT_PUBLIC_COVEY_BRAND_ACTIVE` → Preview only: value `true`.
4. Push a no-op commit to a feature branch (`git commit --allow-empty -m "chore: trigger preview for Phase 5 push verification"`) → Vercel auto-deploys a preview.
5. Grab the preview URL from `gh pr view` or Vercel dashboard.
6. On the preview URL, sign in as a test Keeper in a test household (not a real user household).
7. Add yourself (on a second device/browser) as a test Watcher in the `covey` group with `notifyBellRinging=true`.

---

## Test script

Run these in order. Each test requires at least 2 devices or browser sessions (one Keeper, one Watcher).

### Test 1 — Lantern push
```
Device A (Keeper): Light the Lantern → pick any reason
Device B (Watcher, villageGroup=covey): Wait for push notification
Expected push:
  Title: 🪔 <household> needs help
  Body: <reason>
  Tap: opens /?tab=lantern
```

### Test 2 — Whistle push
```
Device A (Keeper): Post a new Whistle
Device B (Watcher): Wait for push notification
Expected push:
  Title: 📋 New Whistle — <household>
  Body: <shift title> · <date>
  Tap: opens /?tab=almanac
```

### Test 3 — Escalation push
```
Device A (Keeper): Light a Lantern, then wait 5+ minutes without any Watcher responding
  (or: manually trigger cron via curl -H "Authorization: Bearer $CRON_SECRET" joincovey.co/api/bell/cron)
Device C (Watcher, villageGroup=field, notifyBellRinging=true): Wait for push
Expected push:
  Title: 🪔 Still needed — <reason>
  Body: Your Covey didn't answer. Can you help?
  Tap: opens /?tab=lantern
```

### Test 4 — Covered-Whistle push
```
Device A (Keeper): Post a Whistle
Device B (Watcher): Claim/cover the Whistle
Device A: Wait for push notification
Expected push:
  Title: ✅ <watcher name> covered it
  Body: "<shift title>" · <date>
  Tap: opens /?tab=almanac
```

### Test 5 — SW fallback
```
In browser console on the preview URL:
  const sw = await navigator.serviceWorker.ready;
  sw.active.postMessage({type: 'SW_PING'}); // observe SW response
Check sw.js response header: should include covey-v2 in script comment
  curl -s joincovey.co/sw.js | head -1
  Expected: // Covey Service Worker — build <sha> — cache covey-v2
```

---

## Graveyard

(empty — no failed attempts yet)

---

## Anchors

- All push copy flows through `getCopy()` → `lib/copy.covey.ts` or `lib/copy.homestead.ts` — no hardcoded strings in notify.ts or push.ts
- SW script (`app/api/sw-script/route.ts`) reads `NEXT_PUBLIC_COVEY_BRAND_ACTIVE` at runtime and sets cache version + brand name
- Push delivery uses `web-push` with VAPID — requires VAPID env vars set on preview (should already be set if preview env inherits from production scope)
- `notifyBellRing` only pushes to `villageGroup='covey'` + `notifyBellRinging=true` users
- `notifyBellEscalated` only pushes to `villageGroup='field'` + `notifyBellRinging=true` users

---

## Fragile areas

- VAPID env vars must be set on the preview deployment. If they're scoped to Production only, push delivery silently fails (`reason: 'vapid_not_configured'` in push_batch log). Check Vercel env var scopes.
- `NEXT_PUBLIC_COVEY_BRAND_ACTIVE` must be set alongside `COVEY_BRAND_ACTIVE` — the SW script reads the `NEXT_PUBLIC_` version at the edge; the notify functions read the non-public version server-side.
- Escalation cron requires `CRON_SECRET` to be set on preview. If it's production-scoped only, manual curl trigger won't work.
- iOS requires the PWA to be installed (Add to Home Screen) to receive push. A browser tab on iOS does not receive WebPush.
- Test in a dedicated test household — do not use a household with real caregivers or you will send live pushes to real phones.

---

## Handoff — 2026-05-01

- What was attempted: Plan written; no device test run yet
- What worked: All push copy verified as flowing through getCopy() — no hardcoded strings found in notify.ts or push.ts
- What's blocked: Requires Vercel preview env var change (Preview scope `COVEY_BRAND_ACTIVE=true`) + real device with push permissions
- Next action: Matt sets the two Preview env vars in Vercel dashboard, triggers a preview deploy from a feature branch, then runs Test 1–5 above

## Kill-switch handoff — 2026-05-03

**Ruled out (class of fix eliminated):**
- Role/recipient filter: Meredith's row has `role=watcher`, `village_group=covey`, `notify_bell_ringing=true` — she passes the filter. Not the problem.
- Subscription registration: PushRegistrar.tsx null-keys guard fixed (PR #83). Subscription does reach the DB when she toggles on. Not the problem.
- Apple 403 over-pruning: Fixed in PR #84 — 403+BadJwtToken now retries instead of deleting the sub.
- `ensureVapid()` warm-lambda cache: Fixed in PR #84 — no longer latched.
- `VAPID_SUBJECT` missing `mailto:` prefix: Fixed in Vercel env.

**What's still failing:**
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in Vercel production has had invalid base64 characters across two replacement attempts (non-URL-safe chars), causing `web-push` to throw `"Vapid public key must be URL safe Base 64"` on every push attempt. The env var has been set a third time using `npx web-push generate-vapid-keys --json` output, which is the only reliable source. Current key: `BGBWRhZAfAqYcJxuzJu5-NoMPiv1jFdWkZUGijLriJQVmq5m5qIxqQxxjAbsQxT1b8ZypzY3CbPM_NK-_oIfn78`. This was validated locally with `setVapidDetails()` before being set.
- Every VAPID key rotation invalidates all existing subscriptions. Meredith must re-toggle notifications **after** the deploy containing the correct key is live.

**Next action in new session:**
1. Confirm the 15:22+ deploy is serving the new key: `curl -s https://joincovey.co | grep -o 'VAPID[^"]*'` won't work — instead check Vercel logs for `push_batch` after a test lantern — if no `"Vapid public key"` error appears, the key is good.
2. Have Meredith toggle off/on from Home Screen PWA.
3. Confirm her subscription appears in DB (`push_subscriptions` table, `created_at` after deploy time).
4. Light Lantern. Check `push_batch` log for `delivered:1`.
5. If still `BadJwtToken`: the issue is the subscription was created with a different public key than what's now signing. Solution: delete all of Meredith's stale subscriptions from DB directly, force fresh subscribe.

**What to read first:** `lib/push.ts` (current `ensureVapid` impl), `BUGS.md` (BUG-D, BUG-E), Vercel env vars for VAPID.
