---
title: Household admin — visibility + transfer UI
created: 2026-05-06
status: ready (queued behind circle-invite-role-audit)
prerequisites: fix(circle) audit PR merged first — this builds on the same MemberCard component
---

## Problem

The household admin role is invisible in the UI. `users.isAdmin` is server-correct and `PATCH /api/household/admin` exists with full atomic transfer logic, but **zero client-side surface area uses either**. Users have no way to see who admin is or change it.

Confirmed by code search 2026-05-06:
- `users.isAdmin: boolean` schema field — present (`lib/db/schema.ts:34`)
- `PATCH /api/household/admin` — implemented, atomic, transaction-guarded (`app/api/household/admin/route.ts`)
- `requireHouseholdAdmin()` — used by 14 routes for gating
- **Zero references** to `isAdmin` in `app/components/ScreenCircle.tsx` or `ScreenSettings.tsx`

## Pattern research (peer apps)

| App | Visibility pattern | Transfer pattern |
|---|---|---|
| Slack | Always-visible badge | Settings → members → role dropdown |
| Notion / Linear / Vercel | Role chip on member list | Click member → role dropdown |
| Apple Family Sharing | "Family organizer" labeled on home screen | Settings → "Switch family organizer" with confirmation |
| 1Password Families | "Family Organizer" tag | Settings → manage members → assign |
| Splitwise | "(admin)" suffix | Group settings → tap to make admin |

**Consistent design rules at this scale:**
1. Admin status is always visible (badge), not behind a tap.
2. Self gets "· you · admin"; others get "· admin" suffix.
3. Transfer is single-step confirmation, not multi-step (2-5 person households don't need that ceremony).
4. Single admin model fits households; multi-admin adds complexity without value.

## Design

### Visibility (always on)

**MemberCard:** add `isAdmin?: boolean` prop. When truthy, render a small chip after the existing `appRole` chip (line 201-210):
```
ADMIN
```
Style: matches the existing 8px-uppercase-letterspaced pattern of role/villageGroup chips. `border: 1px solid G.green`, `color: G.green`, transparent background. Different visual weight than the filled role pill.

**Self-suffix at line 174-175:** when `isMe && isAdmin`, suffix becomes `· you · admin`. When `isMe && !isAdmin`, stays `· you`. Other admins get the chip but no `· you` suffix.

**Watchers see the badge.** Knowing who runs the household is useful, not a privacy issue.

### Transfer (admin-only)

**On other-keeper MemberCards (Circle screen, Family section):** if `viewer.isAdmin && !isMe && otherUser.role === 'keeper'`, add a third action button alongside the existing role-toggle and delete buttons:
```
MAKE ADMIN
```
Style: muted (`color: G.muted`, transparent background, hairline border). Distinct from the green-filled action chips so it doesn't compete visually.

**Tap flow:**
1. Confirmation sheet: "Transfer admin to {name}? You'll lose admin permissions."
2. Buttons: `Transfer` (destructive-ish, green-filled) / `Cancel` (transparent).
3. Confirm → `PATCH /api/household/admin` with `{ targetUserId }`.
4. On 200: refetch Circle data; admin badge moves; viewer's `isAdmin` becomes false.
5. On error: surface server message via existing villageError pattern.

**Self-promote disallowed.** Existing route already returns 400 `same_user`; UI naturally prevents it (button only renders on others).

**Last-keeper case.** If viewer is admin and there are no other keepers (only watchers), the MAKE ADMIN button doesn't render anywhere. No action surface, no confusion. (Future enhancement: a subtle "Promote a keeper first" hint in the empty state — defer.)

### Settings entry point

In `ScreenSettings.tsx` Household section, add one read-only row:
```
Household admin
{adminName}
```
Tappable iff `viewer.isAdmin === true` → opens same confirmation sheet (with a member picker since there's no per-card context here). Alternate entry for users who don't look at Circle.

### Watcher admin edge case

If a watcher row has `isAdmin=true` (legacy data state — shouldn't happen post-audit but conservative), hide the badge on watcher cards. The transfer sheet only lists keepers as eligible targets. Defensive, not load-bearing.

## Out of scope

- Multi-admin (spec lock — `isAdmin: boolean`, single).
- A dedicated "admin settings" page — overkill at this scale.
- Promoting a watcher to admin without role change — design says admin lives on keepers; if a watcher needs admin, promote to keeper first.

## File map

- **EDIT** `app/components/ScreenCircle.tsx`
  - `MemberCard` accepts `isAdmin?: boolean` and `onMakeAdmin?: () => void` props.
  - Render chip when `isAdmin`.
  - Render MAKE ADMIN button when `onMakeAdmin && !isMe && otherUser.role === 'keeper'`.
  - Self-suffix conditional update.
  - Family-section `parents.map(p => ...)` (line 975-993) passes `isAdmin={p.isAdmin}` and conditional `onMakeAdmin`.
  - State: `transferTarget: User | null`, `transferring: boolean`. Confirmation sheet component (similar pattern to existing `villageGroup` picker at lines 253-296).

- **EDIT** `app/api/circle/route.ts`
  - GET response already includes `isAdmin` (it's a column on `users`); confirm and re-test. If excluded by select shape, add it.

- **EDIT** `app/components/ScreenSettings.tsx`
  - Household section: new "Household admin: {name}" row. Tap (admin only) → opens member-picker sheet → confirmation → PATCH.

### Tests
- **NEW** `tests/admin-badge-visibility.test.ts` — admin's MemberCard renders ADMIN chip; non-admin's does not.
- **NEW** `tests/admin-transfer-flow.test.ts` — only admin viewer sees MAKE ADMIN button on other keepers; PATCH fires with correct targetUserId; on success, badge moves.
- **NEW** `tests/admin-transfer-watcher-not-eligible.test.ts` — MAKE ADMIN button does NOT render on watcher cards.
- (Existing `tests/admin-transfer.test.ts` covers the route logic.)

## Conventions (matches audit PR + project)

- Error helper `authError` — already used by the route.
- Optimistic-then-confirm UX pattern matches existing `removeAdult` / `removeKid` style.
- Style tokens from `G` palette in `tokens.ts`; no new tokens.

## Anchors (do not break)

- `PATCH /api/household/admin` atomic transfer transaction (`route.ts:27-65`).
- `requireHouseholdAdmin()` 14-route gating chain.
- `/api/circle/leave` last-admin block (`leave/route.ts:25-30`).

## Definition of done

- Admin badge visible on MemberCard for the admin keeper, on every Circle screen render.
- Settings row shows current admin; admin-tappable opens transfer.
- Admin can transfer to another keeper via Circle MemberCard or Settings entry; PATCH succeeds; UI updates.
- All 3 new tests pass.
- Visual walkthrough: keeper sees their own card with `· you · admin`; co-parent's card shows the chip after transfer; watcher's card never shows MAKE ADMIN; last-keeper case shows no transfer button anywhere.
- No regression in existing transfer route tests.

## Sequencing

Ships **after** `fix/circle-invite-role-audit` merges. The audit stabilizes `MemberCard` props and `/api/circle` filtering; this PR builds on both. Don't bundle — keeps the audit reviewable and admin-visibility focused.
