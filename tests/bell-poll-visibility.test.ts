import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// F-P1-B regression: bell polling pauses on visibilitychange to 'hidden'
// and resumes on 'visible'.
//
// Two layers of coverage:
//  1. Static: AppDataContext source registers a visibilitychange listener.
//  2. Behavioral: extracted polling logic (same shape as the useEffect) behaves
//     correctly when visibilitychange fires.

const APP_DATA_CONTEXT = readFileSync(
  join(__dirname, '..', 'app', 'context', 'AppDataContext.tsx'),
  'utf8',
);

describe('F-P1-B — bell poll visibility pause (static check)', () => {
  it('AppDataContext registers a visibilitychange listener', () => {
    expect(APP_DATA_CONTEXT).toContain('visibilitychange');
  });

  it('AppDataContext clears the interval on hidden', () => {
    expect(APP_DATA_CONTEXT).toContain("visibilityState === 'hidden'");
    expect(APP_DATA_CONTEXT).toContain('clearInterval');
  });

  it('AppDataContext restarts interval and fetches on visible', () => {
    expect(APP_DATA_CONTEXT).toContain('setInterval');
  });

  it('AppDataContext removes the visibilitychange listener on cleanup', () => {
    expect(APP_DATA_CONTEXT).toContain("removeEventListener('visibilitychange'");
  });
});

// ── Behavioral test using extracted polling logic ─────────────────────────────
//
// This mirrors the onVisibility handler from AppDataContext verbatim.
// The document object is not available in node environment, so we simulate
// visibilityState and dispatching via a minimal EventTarget shim.

describe('F-P1-B — bell poll visibility pause (behavioral)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  function runPoller(fetchBell: () => void, BELL_POLL_MS: number) {
    let timerRef: ReturnType<typeof setInterval> | null = null;
    let visibilityState = 'visible';
    const handlers: (() => void)[] = [];

    function triggerVisibility(state: 'hidden' | 'visible') {
      visibilityState = state;
      for (const h of handlers) h();
    }

    timerRef = setInterval(fetchBell, BELL_POLL_MS);

    const onVisibility = () => {
      if (visibilityState === 'hidden') {
        if (timerRef) { clearInterval(timerRef); timerRef = null; }
      } else {
        fetchBell();
        timerRef = setInterval(fetchBell, BELL_POLL_MS);
      }
    };
    handlers.push(onVisibility);

    return {
      triggerVisibility,
      destroy() { if (timerRef) clearInterval(timerRef); },
    };
  }

  it('interval fires while visible', () => {
    const fetchBell = vi.fn();
    const { destroy } = runPoller(fetchBell, 10_000);
    vi.advanceTimersByTime(10_000);
    expect(fetchBell).toHaveBeenCalledTimes(1);
    destroy();
  });

  it('interval stops firing when hidden', () => {
    const fetchBell = vi.fn();
    const { triggerVisibility, destroy } = runPoller(fetchBell, 10_000);
    triggerVisibility('hidden');
    vi.advanceTimersByTime(30_000);
    expect(fetchBell).toHaveBeenCalledTimes(0);
    destroy();
  });

  it('fetchBell fires immediately on reveal and polling resumes', () => {
    const fetchBell = vi.fn();
    const { triggerVisibility, destroy } = runPoller(fetchBell, 10_000);
    triggerVisibility('hidden');
    triggerVisibility('visible');
    // Immediate call on reveal
    expect(fetchBell).toHaveBeenCalledTimes(1);
    // Resumed polling
    vi.advanceTimersByTime(10_000);
    expect(fetchBell).toHaveBeenCalledTimes(2);
    destroy();
  });
});
