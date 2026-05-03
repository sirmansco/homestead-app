'use client';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/nextjs';

// ── Types (shared across screens) ───────────────────────────────────────────

export type ActiveBellData = {
  id: string;
  reason: string;
  status: string;
  handledByName: string | null;
  createdAt: string;
  endsAt: string;
  startsAt?: string;
  escalatedAt: string | null;
  note?: string | null;
  responses: { userId: string; response: string; name: string | null }[];
  myResponse?: string | null;
};

export type ShiftRow = {
  shift: {
    id: string;
    title: string;
    forWhom: string | null;
    notes: string | null;
    startsAt: string;
    endsAt: string;
    rateCents: number | null;
    status: 'open' | 'claimed' | 'cancelled' | 'done';
    householdId: string;
    claimedByUserId: string | null;
    preferredCaregiverId: string | null;
  };
  household: { id: string; name: string; glyph: string } | null;
  creator: { id: string; name: string } | null;
  claimer: { id: string; name: string } | null;
  claimedByMe?: boolean;
  createdByMe?: boolean;
  requestedForMe?: boolean;
};

export type VillageMember = {
  id: string;
  name: string;
  villageGroup: 'covey' | 'field';
  photoUrl?: string | null;
};

// ── Context shape ────────────────────────────────────────────────────────────

type AppDataCtx = {
  // Bell
  activeBell: ActiveBellData | null;
  allBells: ActiveBellData[];        // full list for caregiver BellIncoming
  bellLoading: boolean;
  refreshBell: () => void;

  // Shifts — keyed by scope string
  shifts: Record<string, ShiftRow[]>;
  shiftsLoading: Record<string, boolean>;
  refreshShifts: (scope: string) => void;

  // SSE stream for live village/all-scope shifts
  enableShiftStream: (on: boolean) => void;

  // Village
  village: VillageMember[];
  villageLoading: boolean;
  refreshVillage: () => void;
};

const AppDataContext = createContext<AppDataCtx | null>(null);

export function useAppData(): AppDataCtx {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────────────

const BELL_POLL_MS = 10_000;

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  // Bell state
  const [activeBell, setActiveBell] = useState<ActiveBellData | null>(null);
  const [allBells, setAllBells] = useState<ActiveBellData[]>([]);
  const [bellLoading, setBellLoading] = useState(false);
  const bellTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBell = useCallback(async () => {
    setBellLoading(true);
    try {
      const res = await fetch('/api/bell/active');
      if (!res.ok) return;
      const data = await res.json();
      const bells: ActiveBellData[] = data.bells || [];
      setAllBells(bells);
      const ringing = bells.find((b) => b.status === 'ringing') ?? null;
      setActiveBell(ringing);
    } catch (err) {
      Sentry.captureException(err, { tags: { source: 'appdata:bell' } });
      console.warn('[appdata:bell] fetch failed', err instanceof Error ? err.message : String(err));
    } finally {
      setBellLoading(false);
    }
  }, []);

  const refreshBell = useCallback(() => { void fetchBell(); }, [fetchBell]);

  // Start bell polling on mount; refresh on window focus
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

  // Shifts state
  const [shifts, setShifts] = useState<Record<string, ShiftRow[]>>({});
  const [shiftsLoading, setShiftsLoading] = useState<Record<string, boolean>>({});

  const fetchShifts = useCallback(async (scope: string) => {
    setShiftsLoading(prev => ({ ...prev, [scope]: true }));
    try {
      const res = await fetch(`/api/shifts?scope=${scope}`);
      if (res.status === 401 || res.status === 409) {
        setShifts(prev => ({ ...prev, [scope]: [] }));
        return;
      }
      if (!res.ok) return;
      const data = await res.json() as { shifts: ShiftRow[] };
      setShifts(prev => ({ ...prev, [scope]: data.shifts }));
    } catch (err) {
      Sentry.captureException(err, { tags: { source: `appdata:shifts:${scope}` } });
      console.warn(`[appdata:shifts:${scope}] fetch failed`, err instanceof Error ? err.message : String(err));
    } finally {
      setShiftsLoading(prev => ({ ...prev, [scope]: false }));
    }
  }, []);

  const refreshShifts = useCallback((scope: string) => { void fetchShifts(scope); }, [fetchShifts]);

  // Refresh shifts on window focus for the scopes that have been loaded
  const shiftsRef = useRef(shifts);
  shiftsRef.current = shifts;
  useEffect(() => {
    const onFocus = () => {
      Object.keys(shiftsRef.current).forEach(scope => { void fetchShifts(scope); });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchShifts]);

  // SSE stream — enabled by screens that need live village-scope shift updates
  const [streamEnabled, setStreamEnabled] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const enableShiftStream = useCallback((on: boolean) => {
    setStreamEnabled(on);
  }, []);

  useEffect(() => {
    if (!streamEnabled) {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      return;
    }

    let active = true;

    function connect() {
      if (esRef.current) esRef.current.close();
      const es = new EventSource('/api/shifts/stream');
      esRef.current = es;

      es.onmessage = (evt) => {
        try {
          const rows = JSON.parse(evt.data) as ShiftRow[];
          // Update both 'village' and 'all' scopes — stream returns village-scoped data
          setShifts(prev => ({ ...prev, village: rows, all: rows }));
        } catch (err) {
          Sentry.captureException(err, { tags: { source: 'appdata:stream:parse' } });
          console.warn('[appdata:stream] parse error', err instanceof Error ? err.message : String(err));
        }
      };

      es.addEventListener('error', () => {
        // SSE error (network drop, server restart) — reconnect after 5s if still enabled
        es.close();
        esRef.current = null;
        setTimeout(() => { if (active) connect(); }, 5_000);
      });

      es.addEventListener('reconnect', () => {
        // Server self-terminated before Vercel's hard kill — reconnect immediately
        es.close();
        esRef.current = null;
        if (active) connect();
      });
    }

    connect();

    return () => {
      active = false;
      esRef.current?.close();
      esRef.current = null;
    };
  }, [streamEnabled]);

  // Village state
  const [village, setVillage] = useState<VillageMember[]>([]);
  const [villageLoading, setVillageLoading] = useState(false);

  const fetchVillage = useCallback(async () => {
    setVillageLoading(true);
    try {
      const res = await fetch('/api/village');
      if (!res.ok) return;
      const data = await res.json();
      setVillage(data.adults || []);
    } catch (err) {
      Sentry.captureException(err, { tags: { source: 'appdata:village' } });
      console.warn('[appdata:village] fetch failed', err instanceof Error ? err.message : String(err));
    } finally {
      setVillageLoading(false);
    }
  }, []);

  const refreshVillage = useCallback(() => { void fetchVillage(); }, [fetchVillage]);

  useEffect(() => { void fetchVillage(); }, [fetchVillage]);

  return (
    <AppDataContext.Provider value={{
      activeBell, allBells, bellLoading, refreshBell,
      shifts, shiftsLoading, refreshShifts,
      enableShiftStream,
      village, villageLoading, refreshVillage,
    }}>
      {children}
    </AppDataContext.Provider>
  );
}
