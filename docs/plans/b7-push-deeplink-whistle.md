---
title: B7 — push deep-link to specific whistle
session: 6 (P1 batch continuation)
created: 2026-05-04
---

## Spec

When a keeper receives a push from `notifyShiftClaimed` (and the new B8 `notifyShiftClaimedConfirmation` for the watcher), tapping the push must open the app to the relevant tab AND scroll/highlight the matching `ShiftCard`. Today the URL is `/?tab=perch` only — so on a screen with multiple open whistles, the keeper sees the tab but has to scan to find which one was claimed.

**Functional requirement (falsifiable):** with two open whistles A and B in the same household, claim B → keeper taps the resulting push → Perch tab opens AND the ShiftCard for B is visibly highlighted (color change, ring, or scrolled-into-view animation) for ≥2 seconds. Card A is not highlighted.

## Conventions

- Deep-link param parsing already exists at `app/components/CoveyApp.tsx:262-280` for `?tab=`. New `?whistle=` lookup follows the same pattern: read on mount, validate, clean from URL via `history.replaceState`.
- Push URLs are built in `lib/notify.ts` as template literals with `t.request.deepLinkTab`. Format: `/?tab=${tab}` (no nested params today). Append `&whistle=${id}` after the tab.
- ShiftCard in ScreenPerch (keeper view) is `React.memo`'d at line 166. Memo equality compares props — adding a `highlightId` prop must not break memoization for the common (non-highlighted) case. Pass `isHighlighted: boolean` instead of the raw id so memo equality stays cheap.
- Highlight treatment: existing component uses tailwind-via-inline-style. Reuse `G.amber` or similar accent token from `app/components/shared.tsx` rather than introducing a new color.
- Auto-clear the highlight after a fixed window (~5s) so a stale `?whistle=` from history doesn't permanently mark a card.

## File map

- `lib/notify.ts` — append `&whistle=${shiftId}` to URL in `notifyShiftClaimed` (line ~199-204) AND `notifyShiftClaimedConfirmation` (line ~240-247).
- `app/components/CoveyApp.tsx` — extend deep-link useEffect to also parse `?whistle=`, store in state `highlightWhistleId`, expose via existing context or new prop down to ScreenPerch. Also add visibilitychange + focus listeners that re-parse the URL (since a PWA brought-to-foreground doesn't re-mount).
- `app/components/ScreenPerch.tsx` — ShiftCard accepts `isHighlighted: boolean`, applies visual treatment + scrollIntoView on first true.
- `tests/push-deeplink-whistle.test.ts` — new. Source-grep falsifiability + URL build assertion.

## Graveyard

(empty at start)

## Anchors

- B6 + B8 just shipped on main (3cde3f4, 9dd0f9e). Confirmation-push wiring relies on the same `pushToUser` URL field this PR is now extending.
- Existing tab deep-link (CoveyApp.tsx:262-280) — must continue to work. Test: `?tab=perch` alone (without `whistle=`) still navigates correctly.
- ShiftCard memoization — adding a prop must not cause cards to re-render every state change for the common non-highlighted case.

## Fragile areas

- `useEffect` with empty dep array (the deep-link effect) runs once on mount. PWA standalone mode keeps the same JS context across foreground transitions — cold push → tap → app foreground does NOT remount. That's why visibilitychange + focus listeners are required, not optional.
- `history.replaceState` clears the URL param but does NOT trigger a re-render. If state isn't set before replaceState, the prop is lost.
- `setScreen` has its own useEffect with `eslint-disable-next-line react-hooks/set-state-in-effect`. Don't repeat that pattern for `setHighlightWhistleId` — set state from the URL parse synchronously inside the effect handler, then schedule the auto-clear via setTimeout outside.
