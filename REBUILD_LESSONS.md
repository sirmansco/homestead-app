# Homestead — Build Post-Mortem & Lessons Learned

> Written 2026-04-22. This covers the full arc from first deploy to beta-ready.
> Use this when starting Homestead v2, a new feature-set sprint, or any future
> Next.js + Clerk + Drizzle + Neon project.

---

## What we built

A PWA for family childcare coordination: parents post shifts, caregivers claim
them, the Bell is an emergency "I need help now" escalation. Village is the
social graph (inner / family / sitter circles). Auth via Clerk orgs. DB via
Neon Postgres + Drizzle ORM. Push via VAPID. Photos via Vercel Blob.

---

## Bug categories and root causes

### 1. Auth timing — the "401 on first load" trap

**What happened:** The Almanac tab showed `Failed (401)` every time a user
opened the app cold, even when signed in. Testers would see it and assume the
app was broken.

**Root cause:** The GET catch block in `/api/shifts/route.ts` returned `401`
for every exception — including "No active household" (which fires before
Clerk's org context is attached) and any runtime error. The client only checked
`res.status` and showed a red banner. On first render the org context wasn't
resolved yet, so 401 was the _expected_ transient state.

**Fix:** Discriminate error types in the catch: `401` for "Not signed in",
`409 {error:'no_household'}` for missing org, `500` for everything else. The
client treats `no_household` as an empty state, not an error.

**Next build rule:** Every API route needs three distinct status codes for auth
errors: 401 (not authenticated), 403 (authenticated but no access), 409 (needs
setup/onboarding). Never return 401 from a catch-all.

---

### 2. Raw SQL errors leaking to the UI

**What happened:** "Post a Need" showed `Failed query: insert into "shifts" ...`
in the caregiver's face. Full SQL with bound parameters.

**Root cause:** Every `catch (err)` block was doing
`return NextResponse.json({ error: err.message })`. Drizzle's `DrizzleQueryError`
serializes the entire SQL query including values.

**Fix:** Created `lib/api-error.ts` — a shared helper that logs `err` server-side
and returns a safe generic string to the client. Applied to every route.

**Next build rule:** Wire up `lib/api-error.ts` on day one. Never ship without
it. The pattern is: `catch(err) { return apiError(err, 'friendly message', 500, 'route:method') }`.

---

### 3. Drag-drop trapped above the fold

**What happened:** In Village, dragging a member to a circle below the visible
scroll position was impossible. The drag worked, but the page didn't scroll.

**Root cause:** The `onMove` pointer handler called `e.preventDefault()` on
every move event, which blocked native scroll. There was no auto-scroll
implementation to replace it.

**Fix:** Added a `scrollRef` on the container. During drag, when `e.clientY` is
within 64px of the container edge, drive `scrollRef.current.scrollBy` via
`requestAnimationFrame`. Cancel on pointer-up.

**Next build rule:** Any custom drag implementation that calls
`preventDefault()` on move _must_ include edge auto-scroll. Test with content
below the fold from the very start.

---

### 4. Names displaying as email slugs

**What happened:** "Mjsirmans" appeared everywhere instead of "Matt S." — in
Village, Bell, Almanac, Shifts.

**Two-part root cause:**
1. On iOS signup, Clerk only captures username + email, not first/last name.
   The user row was created with `name = email` as the fallback.
2. There was no resync on subsequent logins, so even after the user adds their
   name in Clerk, the DB retained the email-derived slug.

**Fix:**
- Added `looksLikeSlug()` helper in `lib/format.ts`.
- On every `requireHousehold()` call: if the stored name looks like a slug AND
  Clerk has first+last name, update the DB row in place.
- Wrapped every name render site in `shortName()`.

**Next build rule:** Always run a "user.name looks like email/slug" check on
login and backfill from Clerk's `firstName + lastName`. Never trust the initial
insert. Wrap _all_ name display sites in `shortName()` from day one — find them
with `grep '\.name'` before shipping.

---

### 5. Role switcher gated to a null ID

**What happened:** The parent couldn't preview the caregiver experience in
production. The `DEV_USER_ID` constant had both branches of its ternary
returning `null`.

**Root cause:** The original implementation used a hardcoded Clerk user ID that
was correct in development but was set to `null` in production via a broken
ternary (`condition ? null : null`).

**Fix:** Replaced with `NEXT_PUBLIC_DEV_EMAILS` — a comma-separated env var
containing the emails allowed to use the role switcher. Added to Vercel env.

**Next build rule:** Never hardcode user IDs — they change between environments.
Use emails or org slugs. Store developer-mode gates in env vars, not code.

---

### 6. Account deletion left a live Clerk identity

**What happened:** Clicking "Delete my account" cleared the DB row but left the
Clerk account alive. The user could log back in. The app appeared to still know
them.

**Root cause:** The DELETE handler only soft-nulled DB fields. A comment said
"delete your Clerk account separately." There was also no client-side signOut
after delete — the user was left staring at a dead app state.

**Fix:** Clerk `deleteUser()` runs _after_ all DB cleanup (so DB failure doesn't
orphan a live Clerk account). Client calls `signOut({ redirectUrl: '/' })`.

**Next build rule:** Account deletion is a two-phase transaction: DB first,
auth provider last. Test end-to-end — open DevTools, delete account, confirm
you can't sign back in.

---

### 7. Bell tab always opening compose mode

**What happened:** Tapping the Bell tab always showed the compose screen, even
when a bell was actively ringing. The parent had no way to see/cancel the bell
without knowing the URL or navigating away.

**Root cause:** `HomesteadApp` rendered `<ScreenBell initialCompose={true} />`
unconditionally. There was no check for active bells.

**Fix:** Added `bellCompose` state to `HomesteadApp`. Tab bar sets it false (→
check for active bell on mount). Almanac's bell icon sets it true (→ go
straight to compose). Added a fetch to `/api/bell/active` on ScreenBell mount
that shows the ringing UI if a bell is live.

**Next build rule:** Every entry point to a stateful screen needs to check
existing state before rendering. "Loading" is a valid UI state. Never assume
the starting state — always fetch.

---

### 8. Bell tab showed stale caregiver alerts after cancel

**What happened:** The caregiver's BellIncoming showed a ringing bell even
after the parent cancelled it. The alert lingered for up to 15 seconds.

**Root cause:** The poll interval was 15s and there was no `window.focus`
listener to retrigger a fetch when the user came back to the tab.

**Fix:** Reduced poll to 8s. Added `window.addEventListener('focus', check)`
to re-poll immediately on app focus.

**Next build rule:** Any realtime-adjacent feature (bells, claims, seat booking)
needs both a polling interval AND a `focus` event listener. Use the focus
listener before reducing poll frequency — it covers 90% of the staleness
problem at zero cost.

---

### 9. Photo upload silently failing

**What happened:** Tapping the avatar upload button did nothing. No error, no
spinner, no feedback.

**Root cause:** `BLOB_READ_WRITE_TOKEN` was not connected to the Vercel project.
The upload route returned a 500 but the client swallowed it silently.

**Fix:** Added a 503 guard in the route with a clear error message. Added an
`uploadError` state in `MemberCard` that shows inline text after the avatar.
User connected Blob store in Vercel dashboard.

**Next build rule:** Every upload flow needs (1) explicit loading state,
(2) explicit error state with human-readable message, (3) graceful degradation.
All infrastructure dependencies (blob store, email, push keys) should be checked
at startup or in a health endpoint — not discovered mid-interaction.

---

### 10. No notification preferences

**What happened:** Users had zero control over what push notifications they
received. This is a beta-killer — notification fatigue causes testers to revoke
push permission, and you lose all future delivery.

**Fix:** Added 5 boolean columns to `users`, a `GET/PATCH /api/notifications`
route, and toggle UI in Settings. `notify.ts` checks each recipient's pref
before sending. `notifyShiftReleased` was also missing entirely.

**Next build rule:** Ship notification preferences in v1. It's 2 DB columns, 1
API endpoint, and 5 toggle rows in Settings. The cost is low; the trust signal
to users is high. Also: write `notifyShiftReleased` the same day you write
`notifyShiftClaimed` — they're symmetric and you'll forget otherwise.

---

## How to rebuild this more efficiently

### Phase 1: Infrastructure (day 1, before any UI)

```
1. Schema.ts with all tables including notification prefs
2. lib/api-error.ts
3. lib/notify.ts with all 5 notification types
4. lib/push.ts with pushToUser + pushToHousehold
5. VAPID keys in Vercel env
6. Blob store linked in Vercel dashboard
7. Migration baseline applied
8. Health endpoint: GET /api/health → checks DB, Clerk, Blob, push keys
```

Do not touch UI until `/api/health` is green. Every broken infra discovery
happened during UI testing — it should have been caught here.

---

### Phase 2: Auth & household (day 1–2)

```
9. requireHousehold() with proper error discrimination:
   - 401 for not signed in
   - 409 {error:'no_household'} for no org yet
   - 403 for org access denied
10. Name backfill: always resync from Clerk first/last on auth
11. shortName() enforced at every render site (grep for .name before shipping)
```

---

### Phase 3: Core APIs (day 2–3)

```
12. Every route: catch → apiError(err, 'generic msg', status, 'route:method')
13. Every POST validates foreign keys (UUID regex before DB insert)
14. Notification prefs checked in notify.ts before every send
15. All routes return consistent shape: { data } | { error: string }
```

---

### Phase 4: UI (day 3–5)

```
16. Every screen has a 'loading' state before first data
17. Every upload/post has explicit loading state on the button
18. Every drag implementation includes edge auto-scroll
19. Bell / realtime screens: poll + window.focus listener
20. Role switcher: NEXT_PUBLIC_DEV_EMAILS env var, not hardcoded IDs
```

---

### Phase 5: Pre-launch QA (day 5–6, not earlier)

Test matrix: all 17 scenarios in LAUNCH_PLAN.md against localhost, then
Vercel preview, then iPhone Safari.

Specifically test with:
- A user who just signed up (no org yet) → no 401 banner
- A caregiver account in a separate browser → real role, not switcher
- An outsider account (no household at all) → clean empty state
- Account deletion end-to-end → can't sign back in

---

## The three things that caused the most debugging time

1. **Auth timing.** The 401-on-load was the first thing testers saw. It made
   every other bug feel like the whole app was broken. Fix auth error
   discrimination before anything else.

2. **Missing loading / error states.** Silent failures (upload, notifications)
   looked like the feature didn't exist. Every interactive element needs both.

3. **Testing only the happy path.** All the drag, bell, and caregiver issues
   lived below the fold or behind a role switch. Build the test matrix before
   calling something done, not after it ships.

---

## Key files to audit before any deploy

```
lib/api-error.ts         — exists and is wired into every route
lib/notify.ts            — all 5 notification functions + pref gating
lib/auth/household.ts    — name backfill from Clerk runs on auth
app/components/tokens.ts — G.* tokens consistent with Figma
app/api/shifts/route.ts  — POST coerces preferredCaregiverId to null if invalid
```

---

---

## Batch 2–4 lessons (2026-04-26)

### 11. Fire-and-forget notifications are silent bugs

Dynamic `import('@/lib/push').then(...).catch(() => {})` looks safe but kills
all observability. When a push silently fails, you have no log, no metric, and
no retry. Caregivers miss alerts you thought were delivered.

**Fix:** Static imports, `try { await ... } catch (err) { console.error(...) }`.
The one-liner `.catch(() => {})` is a smell; remove it on sight.

**Next build rule:** Never `.catch(() => {})` a notification send. Always log.
Linting rule: grep for `.catch(() => {})` in `app/api/` and `lib/` before every
release.

---

### 12. Tier-aware push from day one

Broadcasting to all household members when only a subset should receive a
notification (e.g., caregivers, not co-parents) inflates send volume and trains
users to ignore pings. The village group enum (`inner_circle | sitter`) was
added mid-build and required a backfill migration.

**Fix:** `pushToUsers(userIds, householdId, payload)` as a first-class primitive
alongside `pushToUser`. Bell ring targets `inner_circle` caregivers only; shift
posts target `role='caregiver'` only.

**Next build rule:** Schema the social graph tier in the initial migration.
Write `pushToUsers` at the same time as `pushToUser`. Notification routing
decisions belong in `lib/notify.ts`, not scattered across routes.

---

### 13. CSS custom properties from day one — avoid token divergence

Tokens started as hardcoded hex strings in `tokens.ts` and CSS. When dark mode
was added in Batch 4, every color had to be touched twice (CSS vars + TS tokens).
A `#FBF7F0` hardcoded in a button style won't flip with the theme.

**Fix:** CSS custom properties in `globals.css`, all design tokens in `tokens.ts`
reference `var(--...)`. Dark mode = `[data-theme="dark"]` + media query. Blocking
inline script in `<head>` reads `localStorage` before first paint to prevent flash.

**Next build rule:** On day one, define all tokens as CSS custom properties.
`tokens.ts` is just named exports for the variable references. Any hardcoded hex
in a component is a future dark-mode bug.

---

### 14. Date.now() in JSX triggers react-hooks/purity

Calling `Date.now()` (or any non-deterministic function) directly in JSX
attributes like `download={`filename-${Date.now()}.json`}` fails
`react-hooks/purity`. ESLint catches it but only after you're already at 36
problems.

**Fix:** Compute the filename at the same time the URL is generated (state
mutation event), store it in state, reference the state variable in JSX.

**Next build rule:** Inline function calls in JSX attributes are only safe if
the function is pure and referentially stable. `Date.now()`, `Math.random()`,
`URL.createObjectURL()`, etc. all violate purity — move them out of render.

---

*Post-mortem complete. Apply these patterns from day one on the next build.*
