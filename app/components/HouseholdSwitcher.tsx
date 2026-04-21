'use client';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { useOrganizationList } from '@clerk/nextjs';
import { G } from './tokens';

type HouseholdSummary = {
  id: string;
  clerkOrgId: string;
  name: string;
  glyph: string;
  accentColor: string | null;
  active: boolean;
};

type ActiveHouseholdDetails = {
  id: string;
  setupCompleteAt: string | null;
};

type Ctx = {
  active: HouseholdSummary | null;
  all: HouseholdSummary[];
  refresh: () => Promise<void>;
};

const HouseholdContext = createContext<Ctx>({ active: null, all: [], refresh: async () => {} });

export function useHousehold() {
  return useContext(HouseholdContext);
}

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const [all, setAll] = useState<HouseholdSummary[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/household');
      if (!res.ok) return;
      const data = await res.json() as { household?: ActiveHouseholdDetails; allHouseholds?: HouseholdSummary[] };
      setAll(data.allHouseholds || []);
      if (data.household && !data.household.setupCompleteAt && typeof window !== 'undefined') {
        if (window.location.pathname !== '/setup') {
          window.location.replace('/setup');
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const active = all.find(h => h.active) ?? null;

  return (
    <HouseholdContext.Provider value={{ active, all, refresh }}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function HouseholdSwitcher() {
  const { active, all, refresh } = useHousehold();
  const { setActive } = useOrganizationList();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  if (!active) return null;

  async function pick(h: HouseholdSummary) {
    if (h.active || switching || !setActive) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await setActive({ organization: h.clerkOrgId });
      await refresh();
      setOpen(false);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
          fontFamily: G.sans, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
          color: G.muted,
        }}
      >
        <span style={{ fontSize: 14 }}>{active.glyph}</span>
        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {active.name}
        </span>
        {all.length > 1 && <span style={{ opacity: 0.5 }}>▾</span>}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: G.bg, borderRadius: '16px 16px 0 0',
            padding: '20px 20px 32px', width: '100%', maxWidth: 480,
          }}>
            <div style={{
              width: 36, height: 4, background: G.hairline2, borderRadius: 2,
              margin: '0 auto 16px',
            }} />
            <div style={{
              fontFamily: G.sans, fontSize: 10, letterSpacing: 1.5,
              textTransform: 'uppercase', color: G.muted, marginBottom: 10,
            }}>
              Your households
            </div>
            {all.map(h => (
              <button
                key={h.clerkOrgId}
                onClick={() => pick(h)}
                disabled={switching}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', marginBottom: 6,
                  padding: '12px 14px', textAlign: 'left',
                  background: h.active ? G.ink : 'transparent',
                  color: h.active ? '#FBF7F0' : G.ink,
                  border: `1px solid ${h.active ? G.ink : G.hairline2}`,
                  borderRadius: 10, cursor: switching ? 'wait' : 'pointer',
                }}
              >
                <span style={{ fontSize: 22 }}>{h.glyph}</span>
                <span style={{
                  flex: 1, fontFamily: G.display, fontSize: 16, fontWeight: 500,
                }}>{h.name}</span>
                {h.active && (
                  <span style={{
                    fontFamily: G.sans, fontSize: 9, letterSpacing: 1.5,
                    textTransform: 'uppercase', opacity: 0.7,
                  }}>Active</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
