tags: [homestead, plan, clerk, infra]
status: draft
last-updated: 2026-04-28
owner: matt
pairs-with: docs/plans/custom-domain.md (priority #2 — homestead.sirmans.co)

> **Phase:** Plan (Protos v9.6). No env-var changes happen until this plan is approved and the rollback path is acknowledged.

## 1. Spec — what this should do

Move Homestead production off Clerk **dev** keys (`pk_test_...` / `sk_test_...`) onto a Clerk **production** instance (`pk_live_...` / `sk_live_...`) so that:

1. The "Clerk has been loaded with development keys" console warning disappears in prod.
2. Production traffic hits a Clerk instance bound to the production domain (`homestead.sirmans.co`, see plan #2).
3. Local dev (`npm run dev`) continues to use the existing Clerk dev instance — unchanged.
4. Preview deploys continue to use Clerk dev keys — unchanged.
5. Existing prod sessions invalidate cleanly (one forced sign-in for current users, expected).

**Non-goals (v1.0 launch scope):**
- Clerk webhooks (`svix` / `user.created` / `org.created`) — not wired today, not adding now.
- SSO / social providers beyond what dev instance already has — match dev exactly.
- Migrating existing dev users into prod — Matt is the only test user; confirm before swap.
- Email template customization in Clerk — defaults are fine for v1.0.

## 2. Falsifiable success criteria

After ship, all of these must be observably true:

1. Loading `https://homestead.sirmans.co` in a fresh incognito window shows **no** "Clerk: development keys" warning in the browser console.
2. Sign-up flow completes end-to-end on the prod URL and creates a user row in prod Neon.
3. Sign-in with the new prod-instance user lands on the dashboard (no `no_household` 409 loop).
4. `npm run dev` against `.env.local` still authenticates against the dev instance — unchanged.
5. The Vercel preview deployment for any open PR authenticates against the dev instance (preview env still uses `pk_test_...`).
6. `gh run view` on the deploy following the env swap shows green CI.

## 3. Out of scope

- Provisioning the Clerk prod instance via API/Terraform — manual dashboard steps, this is a one-time migration.
- Changing `lib/auth/household.ts` semantics. Auth code is identical; only the keys differ.
- Cleaning up dev-instance test users. Dev instance stays as-is.

## 4. File map

Code changes are minimal. The migration is mostly env-var + Clerk-dashboard work.

| File | Change |
|---|---|
| `homestead-app/.env.local` | **No change** — keeps dev keys. |
| Vercel project env vars (Production scope only) | Swap `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from `pk_test_*`/`sk_test_*` to `pk_live_*`/`sk_live_*`. |
| Vercel project env vars (Preview + Development scope) | **No change** — keep dev keys for previews. |
| `homestead-app/app/api/village/invite/route.ts:54` | Comment-only — verify after swap that `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` redirect still resolves under prod-instance config. No code edit unless the prod instance has different redirect rules. |
| Clerk dashboard (prod instance) | New instance, bind `homestead.sirmans.co` as authorized domain, copy SSO providers from dev, set application name + branding. |

If implementation requires more than these surfaces, **stop and revise this plan** (Hard Rule #8 + scope-creep interrupt).

## 5. Env-var diff

Production environment in Vercel (the only scope that changes):

| Var | Before | After |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_...` | `pk_live_...` |
| `CLERK_SECRET_KEY` | `sk_test_...` | `sk_live_...` |
| `NEXT_PUBLIC_APP_URL` | `https://homestead-app-six.vercel.app` | `https://homestead.sirmans.co` (set in plan #2) |

Preview + Development scopes: unchanged. Local `.env.local`: unchanged.

## 6. Watch-outs

- **Clerk prod requires a verified domain.** This plan blocks on plan #2 (custom domain). Order: domain DNS verified first → Clerk prod instance bound to that domain → env-var swap last.
- **Existing dev users do not exist in the prod instance.** Matt is the only known prod test user. Confirm before swap that no other accounts were created against the dev instance and used in production. Check: `select count(*), email from users` in prod Neon — should be ≤ 2 (Matt's accounts).
- **JWT signing keys change with the swap.** All currently signed-in prod users get a forced sign-out on next request. With Matt as the only prod user, blast radius is one sign-in.
- **Org IDs are isolated per Clerk instance.** Any `clerkOrgId` rows in prod Neon point at the dev instance's orgs. After the swap, those rows reference orgs that no longer exist. Mitigation: nuke the prod `households` and `users` rows immediately before swap (Matt confirms first), so the post-swap user creates a fresh household tied to the prod-instance org.
- **`requireHousehold()` upserts on first auth.** First sign-in after swap will create a new household row keyed to the prod-instance org ID. This is the intended behavior — but it means BUGS.md fragile-area #1 (mixed read/write in `lib/auth/household.ts`) is exercised on the very first request post-swap. If it fails, the user lands in `no_household` 409 loop. Manual smoke test required.
- **`@clerk/nextjs` does not require code changes** between dev and prod keys. Same SDK version, same middleware, same `<ClerkProvider>` — only the env values differ.
- **No webhooks today.** If we add `user.created` webhooks later (e.g., to mirror Clerk → Neon), the prod instance needs its own signing secret. Out of scope here, but document it for the post-v1.0 plan.

## 7. Sequencing

This plan executes only after plan #2 (custom domain) has DNS verified. The actual cutover order:

1. Plan #2 lands `homestead.sirmans.co` → Vercel project → DNS verified.
2. Create Clerk prod instance in dashboard. Bind `homestead.sirmans.co` as the production domain.
3. Configure prod instance to mirror dev (SSO providers, sign-up settings, allowed redirect URLs incl. `/`, `/sign-in`, `/sign-up`).
4. Confirm with Matt: prod Neon `users` and `households` tables are clear (or list the rows for explicit nuke approval).
5. Generate prod-instance keys; record them in 1Password (or wherever Matt stores prod secrets).
6. Update Vercel **Production** env vars only (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`).
7. Trigger a redeploy on `main` (no code change, just env-var refresh).
8. Smoke test: incognito → `https://homestead.sirmans.co` → sign-up → land on dashboard → no console warning. Run all 6 success criteria.
9. If any criterion fails, execute rollback (§9) immediately.
10. After 24h with no regressions, delete dev keys from any prod-scope env (they should already be gone, but verify).

## 8. Verification evidence (for the PR)

The PR closing this plan must include:

- Browser console screenshot from `https://homestead.sirmans.co` showing **no** Clerk dev-key warning.
- Screenshot of Vercel project → Settings → Environment Variables showing the production scope using `pk_live_*` (mask the value).
- Output of `select clerk_org_id, name, created_at from households order by created_at desc limit 5` from prod Neon, showing the new prod-instance org ID format.
- Confirmation that `npm run dev` locally still authenticates (the dev instance is untouched).

No regression test possible at the unit level — this is config, not code. The smoke test screenshots **are** the evidence per Hard Rule #7.

## 9. Rollback

**Trigger conditions** (any one is enough):
- Sign-up or sign-in fails on `homestead.sirmans.co` after the swap.
- Console shows new errors referencing Clerk that weren't present before.
- `requireHousehold()` 409 loop on first prod sign-in and the cause isn't obvious within 10 minutes.
- Matt loses access to his own admin household.

**Rollback steps:**

1. In Vercel Production env vars, swap `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` back to the previous `pk_test_*` / `sk_test_*` values. (Keep them in 1Password before swap so paste-back is one step.)
2. Trigger a redeploy on `main`.
3. If the prod `households` / `users` rows were nuked in step 4 of §7, restore from the Neon point-in-time backup taken pre-swap. **Take this backup explicitly before step 4** — do not rely on Neon's default retention.
4. Confirm dev-key login works again (the dev-key warning will be back; that's expected).
5. File a `docs/lessons.md` entry naming what failed and what would have caught it.

**Recovery time objective:** under 15 minutes from rollback decision to working state.

**What rollback does NOT undo:**
- The Clerk prod instance itself (leave it; cheap to keep, expensive to recreate).
- The custom domain (plan #2 — its rollback path is independent).

## 10. Graveyard

_(empty — first attempt; entries dated when added)_

## 11. Anchors (must not break)

- `npm run dev` still authenticates against dev Clerk via `.env.local`.
- All preview deploys still authenticate against dev Clerk.
- `lib/auth/household.ts` `requireHousehold()` contract unchanged (still discriminates 401/403/409 per CLAUDE.md auth convention).
- Vercel auto-deploy on push to `sirmansco/homestead-app` main still works.

## 12. Fragile areas touched

- **`lib/auth/household.ts`** (BUGS.md fragile #1) — exercised on first post-swap sign-in. If it 500s, the migration is blocked. Manual smoke test is non-optional.
- **Production Neon `households` + `users` tables** — schema unchanged, but row contents become stale (clerk_org_id mismatch) until first post-swap sign-in writes a fresh row.

## 13. Handoff

Plan written but **not executed**. Awaiting:
1. Plan #2 (custom domain) — must finish first.
2. Matt confirms prod Neon row count is ≤ 2 (or approves the nuke).
3. Matt approves the rollback path in §9.

Once those three gate items are green, execute §7 sequence in a single session.

### Update — 2026-04-29
Custom domain deferred indefinitely (Matt's call this session). App stays on `homestead-app-six.vercel.app` and Clerk dev keys for now — fully functional, just shows the "development keys" console warning. Resume this plan when a domain is provisioned. Tracked in `Apps/Homestead/TODO.md` under Infra tie-ins.
