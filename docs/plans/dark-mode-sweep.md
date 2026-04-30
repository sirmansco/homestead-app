# Plan: dark-mode-sweep

**Goal:** Replace all hardcoded `#FBF7F0` / `rgba(251,247,240,...)` values in UI components with CSS tokens (`G.bg`, `var(--bg)`) and introduce a `<GButton>` primitive to prevent recurrence.

**Success criteria:** Every screen (Bell, Almanac, Post, Shifts, TimeOff, HouseholdSwitcher, HomesteadApp drawer, auth pages, guide, setup) renders correctly in both light and dark mode on a manual walkthrough with no visual regression on light mode. No raw `#FBF7F0` remains in any component file (icons, manifest, layout `themeColor` are intentionally excluded).

**Out of scope:** `icon.tsx`, `icon-192.tsx`, `icon-512.tsx`, `icon-maskable.tsx`, `apple-icon.tsx`, `manifest.ts`, `app/layout.tsx` `themeColor` — brand-fixed values, not adaptive UI.

---

## Spec

The token layer already works. `globals.css` defines `--bg` (light: `#FBF7F0`, dark: `#16110C`) and all other tokens. `tokens.ts` exposes them as `G.bg`, `G.ink`, etc. Components bypass the token system by hardcoding `#FBF7F0` directly — the fix is substitution, not architecture.

Pattern A — **text on dark surface** (`background: G.ink, color: '#FBF7F0'`): `G.ink` in dark mode becomes `#F0EBE3` (light cream), so the button inverts naturally — background becomes light, text must become dark. Fix: `color: G.bg` → in dark mode this becomes dark text on light surface, which is correct.

Pattern B — **active chip** (`background: '#FBF7F0', color: G.ink`): same inversion logic — `G.bg` as background, `G.ink` as text. Already adaptive.

Pattern C — **page backgrounds** (`background: '#FBF7F0'`): replace with `G.bg`.

Pattern D — **`rgba(251,247,240,0.25)`** border/overlay: replace with `color-mix(in srgb, var(--bg) 25%, transparent)` or restructure using `G.hairline`.

`<GButton>` primitive: single component that encodes the button variants (primary = ink bg / bg text, danger = red / bg text, ghost = transparent) so no component needs to know the color values.

---

## File map

| File | Change |
|---|---|
| `app/components/tokens.ts` | Add `G.bgText` alias (= `var(--bg)`) — optional semantic alias |
| `app/components/shared.tsx` | Fix `GAvatar` line 49; add `<GButton>` export |
| `app/components/HomesteadApp.tsx` | Lines 53, 81, 86–88, 107–108, 353, 357, 367 |
| `app/components/ScreenBell.tsx` | Lines 73, 154, 316, 497, 507 |
| `app/components/ScreenAlmanac.tsx` | Lines 273, 294, 359, 365, 423, 441, 462, 466, 732, 976 |
| `app/components/ScreenPost.tsx` | Lines 210, 248, 261, 307, 323, 406 |
| `app/components/ScreenShifts.tsx` | Line 86 |
| `app/components/ScreenTimeOff.tsx` | Line 34 |
| `app/components/WhenPicker.tsx` | Line 92 |
| `app/components/HouseholdSwitcher.tsx` | Line 166 |
| `app/components/InstallHint.tsx` | Lines 41, 60 |
| `app/guide/page.tsx` | Line 10 |
| `app/sign-in/[[...sign-in]]/page.tsx` | Line 8 |
| `app/sign-up/[[...sign-up]]/page.tsx` | Line 8 |
| `app/setup/page.tsx` | Line 99 |
| `app/accept-family-invite/page.tsx` | Line 22 |

---

## Graveyard

_(empty — no failed approaches yet)_

---

## Anchors

- Light mode appearance must be visually identical after the sweep — `G.bg` in light mode resolves to `#FBF7F0`, so substitutions are no-ops in light.
- `GAvatar` background tones (`TONES` array) are intentionally dark — cream text on them is correct; `G.bg` is the right fix there too since it will remain cream in light and go dark in dark mode (avatar bg also adapts).
- CSS token definitions in `globals.css` are authoritative — do not change token values in this sweep, only the call sites.

---

## Fragile areas

- `ScreenAlmanac` is 1,028 lines — high collision risk. Edit surgical, line by line.
- `HomesteadApp.tsx` line 108 uses `rgba(251,247,240,0.25)` as a border — needs `color-mix()` or a new `G.hairline` variant; don't just drop opacity on `G.bg` without a CSS var.
- `ScreenBell.tsx` line 73 defines a status-chip color object (`rung: { bg: RED, ink: '#FBF7F0' }`) — ink here means "text on red", which should stay light regardless of mode. This is one of the Group 3 intentional cases; replace with `G.bg` (light = cream, dark = very dark — confirm renders correctly on red).

---

## Sequence

1. Add `<GButton>` to `shared.tsx` (primary, danger, ghost variants) — this establishes the primitive before migration.
2. Sweep Group 1 (buttons with `G.ink` bg) — migrate to `<GButton primary>` where clean, or `color: G.bg` where inline style is unavoidable.
3. Sweep Group 2 (active-state chips) — `background: G.bg, color: G.ink`.
4. Sweep Group 3 (text/icon on explicit dark overlay) — `G.bg` substitution; verify on red/green surfaces.
5. Sweep Group 4 (page backgrounds) — `G.bg`.
6. Verify: manual walkthrough both modes.
7. PR with preview URL evidence.
