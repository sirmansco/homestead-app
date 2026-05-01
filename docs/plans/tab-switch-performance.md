---
created: 2026-05-01
status: complete
---

## Spec

**Goal:** eliminate the tab-switch flicker in the Covey PWA without bandaids.

**Root cause:** `renderedScreen` useMemo in HomesteadApp.tsx returns a completely different component tree on every tab switch. React unmounts the old screen and mounts the new one, triggering all `useEffect` fetches from scratch. Three screens also run independent polling loops against `/api/bell/active` (ScreenAlmanac @ 15s, ScreenShifts @ 15s, ScreenLantern @ 10s) — duplicated network work with no coordination.

**Three coordinated fixes (must ship together — each one is a prerequisite for the next):**

1. **Shared data layer** — lift bell polling and shift data into a `AppDataContext` that lives above the screen layer. Screens read from context; they don't own the fetch lifecycle. Tab switches stop triggering network requests entirely.

2. **Keep-alive screen mounting** — render all primary tab screens simultaneously, control visibility with CSS (`display:none`). The useMemo renderScreen pattern is replaced. Screens never unmount; state is preserved; no re-mount cost. Secondary/modal screens (post, settings, diagnostics) remain rendered on-demand — they have nav callbacks, not tab-bar entrances, and don't benefit from keep-alive.

3. **CSS transition** — once screens are always mounted, add a `opacity 150ms ease` fade on the visible screen. Zero runtime cost.

**Success criteria:**
- Tab switches produce no network requests (confirmed via DevTools Network tab — no new fetch fires on tab switch for primary screens)
- `/api/bell/active` polled exactly once per interval, not 2-3x
- All existing screen functionality (claim, cancel, bell ring, respond) unchanged
- No TypeScript errors; existing tests pass

**Out of scope:** WebSocket or subscription-based real-time; migrating to SWR/React Query; refactoring ScreenPost, ScreenSettings, ScreenDiagnostics (they're nav-target screens, not tab screens)

---

## Conventions

From pattern scan of HomesteadApp.tsx, ScreenAlmanac.tsx, ScreenShifts.tsx, ScreenLantern.tsx:

- **Context pattern:** follows `HouseholdContext` shape — `createContext` with typed `Ctx`, `useXxx` hook that throws if used outside provider, `XxxProvider` wrapping children. Mirror this exactly.
- **Fetch pattern:** vanilla `fetch()` with AbortController for cleanup (see ScreenAlmanac line 693). No external library. Keep this.
- **Polling pattern:** `setInterval` inside `useEffect` with `clearInterval` in cleanup. Mirror this in context.
- **Error shape:** local `error: string | null` state, displayed inline. Keep per-screen for mutation errors; polling errors stay silent (current behavior).
- **Loading state:** local `rows: T[] | null` — null = loading, `[]` = empty, `T[]` = data. Keep this convention.
- **Props:** screens receive only callbacks (`onRing`, `onViewLantern`, etc.) — no data passed as props. Keep this — screens will read from context instead.
- **TypeScript:** all components are named exports, no `default export`. All props typed inline.
- **CSS:** inline style objects, no external CSS classes for layout. Visibility toggling must use inline style.
- **AbortController:** used in `load()` callbacks. Context's polling cleanup uses `clearInterval` + `controller.abort()` pattern.

---

## File map

**New files:**
- `app/context/AppDataContext.tsx` — shared data layer: bell polling, shift cache, village data, invalidation API

**Modified files:**
- `app/components/HomesteadApp.tsx` — replace useMemo renderScreen with always-mounted layout; wrap with AppDataProvider; wire navigate/screen state to CSS visibility
- `app/components/ScreenAlmanac.tsx` — remove bell polling and shift fetches from useEffect; read from AppDataContext; keep mutation handlers (claim, cancel, cancel-bell)
- `app/components/ScreenShifts.tsx` — remove bell polling and shift fetches; read from AppDataContext; keep mutation handlers (claim, unclaim)
- `app/components/ScreenLantern.tsx` — remove bell polling from BellRinging; read from AppDataContext; BellCompose POST still fires directly (mutation, not a read)

**Unchanged files:** ScreenPost, ScreenSettings, ScreenDiagnostics, ScreenCircle, GTabBar, HouseholdSwitcher — not tab-bar screens, no keep-alive needed, no polling to dedup

---

## AppDataContext shape

```typescript
type AppData = {
  // Bell state
  activeBell: ActiveBellData | null;
  bellLoading: boolean;
  refreshBell: () => void;          // force immediate re-poll (after ring/respond/cancel)

  // Shifts state — keyed by scope
  shifts: Record<string, ShiftRow[]>;  // scope → rows
  shiftsLoading: Record<string, boolean>;
  refreshShifts: (scope: string) => void;  // force immediate re-fetch for a scope

  // Village
  village: VillageMember[];
  villageLoading: boolean;
};
```

Polling intervals: bell @ 10s (unified, down from 8-15s across screens), shifts lazy (no polling — screens refresh on focus via the existing window-focus pattern, now coordinated).

---

## Keep-alive layout (HomesteadApp.tsx)

Replace `{renderedScreen}` with explicit render of all tab-bar screens, visibility controlled by CSS:

```tsx
// Primary tab screens — always mounted, CSS-toggled
const TAB_SCREENS: TabId[] = ['almanac', 'shifts', 'lantern', 'circle'];

{TAB_SCREENS.map(id => (
  <div key={id} style={{ display: screen === id ? 'block' : 'none' }}>
    {id === 'almanac' && <ScreenAlmanac role={role} isDualRole={isDualRole} onRing={handleRing} onViewBell={() => navigate('lantern')} onPost={() => setScreen('post')} onVillage={() => setScreen('circle')} />}
    {id === 'shifts'  && <ScreenShifts onViewLantern={() => navigate('lantern')} />}
    {id === 'lantern' && <ScreenLantern initialCompose={bellCompose} role={role} onBack={() => setScreen('almanac')} onPost={() => setScreen('post')} />}
    {id === 'circle'  && <ScreenCircle role={role} onOpenSettings={() => setScreen('settings')} />}
  </div>
))}

// Modal/nav screens — still rendered on-demand
{screen === 'post'        && <ScreenPost onCancel={() => setScreen('almanac')} onPost={handlePost} onRing={handleRing} />}
{screen === 'settings'   && <ScreenSettings onBack={() => setScreen('circle')} role={role} onOpenDiagnostics={canSwitchRole ? () => setScreen('diagnostics') : undefined} />}
{screen === 'diagnostics' && <ScreenDiagnostics onBack={() => setScreen('settings')} />}
```

Note: ScreenLantern currently uses a `key={`lantern-${bellCompose}`}` prop to force remount when compose mode changes. With keep-alive, bellCompose becomes a prop that ScreenLantern reads reactively — no key needed, no remount.

CSS transition on visible screen:
```tsx
style={{ display: screen === id ? 'block' : 'none', opacity: screen === id ? 1 : 0, transition: 'opacity 150ms ease' }}
```
Note: `display:none` and `opacity` transition don't compose — use `visibility:hidden` + `opacity:0` if a fade-out is wanted. For a fade-in only (current UX), setting display:block then opacity:1 works directly, but requires a one-frame delay. Simplest correct approach: keep `display:none` for hidden (avoids layout thrash from invisible screens), no fade-out, just fade-in on active. Will validate in browser.

---

## Graveyard

- Python heredoc escaped `!` as `\!` on 2026-05-01 — caused parse error in ScreenShifts.tsx; fixed manually with Edit tool

---

## Anchors

- HouseholdProvider wraps the whole app — AppDataProvider goes inside it (household context is upstream)
- `navigate()` function in HomesteadApp handles side effects on tab switch (bell count refresh) — keep unchanged
- Mutation handlers (claim, cancel, ring bell, respond) stay screen-local — they already call fetch directly and can call `refreshBell()` / `refreshShifts()` from context after mutation
- GTabBar receives `screen` and `onNavigate` — unchanged
- `canSwitchRole` gate for diagnostics — unchanged
- `bellCompose` state in HomesteadApp drives ScreenLantern's initial mode — stays in HomesteadApp, passed as prop

---

## Fragile areas

- **ScreenLantern key prop** (`key={`lantern-${bellCompose}`}`) — this currently forces a remount when compose mode changes. With keep-alive mounting, the key must be removed and ScreenLantern must handle `bellCompose` prop changes reactively via `useEffect([initialCompose])` to switch modes without remount. Risk: if ScreenLantern has internal state tied to the compose/ringing mode that doesn't reset on prop change, behavior diverges. Must verify in browser.
- **`display:none` and scroll position** — browsers preserve scroll position in `display:none` elements in some cases. Switching back to a tab may jump to an unexpected scroll position. Mitigate: `overflow:hidden` on hidden screens, or scroll-to-top on tab-enter (low priority, validate in browser).
- **Polling with all screens mounted** — if AppDataContext polls bell every 10s, the poll must be a single interval, not per-screen. Risk: if any screen also sets up its own polling after the refactor, it will duplicate. Must grep for remaining `setInterval.*bell` calls after refactor.
- **Window focus handler** — ScreenAlmanac currently registers a `window.addEventListener('focus', load)`. After moving load to context, this handler must also move to context (not stay in ScreenAlmanac) to avoid the screen-mounted handler firing in addition to the context handler.
