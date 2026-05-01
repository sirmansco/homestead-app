'use client';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

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
    } catch {
      // silent — polling; next tick will retry
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
    } catch {
      // silent — screens show stale data rather than error on background refresh
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
    } catch {
      // silent
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
      village, villageLoading, refreshVillage,
    }}>
      {children}
    </AppDataContext.Provider>
  );
}
