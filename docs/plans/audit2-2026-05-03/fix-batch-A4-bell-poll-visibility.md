---
title: Audit-2 fix batch A4 — Bell poll visibility pause
date: 2026-05-03
status: planned
governs: F-P1-B
parent-audit: docs/plans/audit2-2026-05-03/fix-sequence.md
batch-id: A4
prereqs: none
unblocks: nothing (A1, A2, A3 are independent)
---

## Spec

After this batch:

1. **F-P1-B** — Bell polling pauses when the page is hidden and resumes when it becomes
   visible again. Currently `app/context/AppDataContext.tsx` polls on a 10 s `setInterval`
   regardless of tab visibility. On mobile, this drains battery and consumes Vercel function
   invocations while the PWA is backgrounded.

   Implementation: add a `visibilitychange` listener alongside the existing `focus` listener.
   When `document.visibilityState === 'hidden'`, clear the interval. When it becomes
   `'visible'`, call `fetchBell()` immediately and restart the interval.

**Done criteria:**

- `grep -n "visibilitychange" app/context/AppDataContext.tsx` returns a match.
- When tab is hidden, interval is cleared; when visible, interval restarts and poll fires
  immediately.
- Regression test passes.

**Out of scope:** Pausing shift-fetch polling or SSE on visibility change (separate
decisions); Service Worker background sync.

## Conventions

- `document.visibilityState` is a browser API — check `typeof document !== 'undefined'`
  before adding the listener (Next.js SSR guard).
- The interval restart on visibility is additive to the existing `focus` handler — both
  stay. `focus` fires when the tab regains focus within the same window; `visibilitychange`
  fires on tab switch / mobile app switch. They are complementary.
- Keep the `bellTimerRef` approach; no new refs needed. Clear and restart the same ref on
  visibility change.

## File map

### `app/context/AppDataContext.tsx` — bell polling `useEffect` (lines ~113–122)

Current:

```ts
useEffect(() => {
  void fetchBell();
  bellTimerRef.current = setInterval(() => { void fetchBell(); }, BELL_POLL_MS);
  const onFocus = () => { void fetchBell(); };
  window.addEventListener('focus', onFocus);
  return () => {
    if (bellTimerRef.current) clearInterval(bellTimerRef.current);
    window.removeEventListener('focus', onFocus);
  };
}, [fetchBell]);
```

After:

```ts
useEffect(() => {
  void fetchBell();
  bellTimerRef.current = setInterval(() => { void fetchBell(); }, BELL_POLL_MS);

  const onFocus = () => { void fetchBell(); };
  window.addEventListener('focus', onFocus);

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      if (bellTimerRef.current) {
        clearInterval(bellTimerRef.current);
        bellTimerRef.current = null;
      }
    } else {
      void fetchBell();
      bellTimerRef.current = setInterval(() => { void fetchBell(); }, BELL_POLL_MS);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    if (bellTimerRef.current) clearInterval(bellTimerRef.current);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}, [fetchBell]);
```

## Graveyard

(empty)

## Anchors

- `fetchBell` is stable (wrapped in `useCallback`) — adding it to cleanup is already correct.
- The `focus` handler and `visibilitychange` handler can both fire in quick succession (e.g.,
  alt-tab back to the browser). This is harmless — `fetchBell` is idempotent and the interval
  restart produces at most one extra interval object before the prior one would have fired.
- `bellTimerRef.current = null` after `clearInterval` is a defensive guard so the restart
  branch doesn't accidentally clear a newly-set interval.

## Fragile areas

- `document` is not defined in SSR. The `useEffect` runs client-side only (correct), so the
  `typeof document` guard is not strictly necessary here — but it is a good habit given the
  Next.js App Router context and worth adding for clarity.
- If `fetchBell` identity changes between renders (unlikely — it is memoized), the effect
  re-runs and re-registers the listener. This is correct behavior; no action needed.

## Regression tests required (Hard Rule #6)

### `tests/bell-poll-visibility.test.ts` — new file

Covers F-P1-B:

- On `visibilitychange` to `'hidden'`: interval is cleared
- On `visibilitychange` to `'visible'`: `fetchBell` is called, interval restarted
- Cleanup (unmount): `visibilitychange` listener is removed
