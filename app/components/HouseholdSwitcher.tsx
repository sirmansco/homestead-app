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
  isDualRole: boolean;
  rolesByHousehold: Record<string, 'parent' | 'caregiver'>;
};

const HouseholdContext = createContext<Ctx>({
  active: null, all: [], refresh: async () => {},
  isDualRole: false, rolesByHousehold: {},
});

export function useHousehold() {
  return useContext(HouseholdContext);
}

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const [all, setAll] = useState<HouseholdSummary[]>([]);
  const [isDualRole, setIsDualRole] = useState(false);
  const [rolesByHousehold, setRolesByHousehold] = useState<Record<string, 'parent' | 'caregiver'>>({});

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/household');
      // 401 (not signed in) — bail. Other statuses still return a JSON body
      // with allHouseholds (possibly empty), so we parse regardless.
      if (res.status === 401) return;
      const data = await res.json().catch(() => ({})) as {
        household?: ActiveHouseholdDetails;
        allHouseholds?: HouseholdSummary[];
        isDualRole?: boolean;
        rolesByHousehold?: Record<string, 'parent' | 'caregiver'>;
      };
      setAll(data.allHouseholds || []);
      setIsDualRole(data.isDualRole ?? false);
      setRolesByHousehold(data.rolesByHousehold ?? {});
      if (data.household && !data.household.setupCompleteAt && typeof window !== 'undefined') {
        if (window.location.pathname !== '/setup') {
          window.location.replace('/setup');
        }
      }
    } catch { /* ignore */ }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh(); }, [refresh]);

  const active = all.find(h => h.active) ?? null;

  return (
    <HouseholdContext.Provider value={{ active, all, refresh, isDualRole, rolesByHousehold }}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function HouseholdSwitcher() {
  const { active, all, refresh } = useHousehold();
  const { setActive } = useOrganizationList();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Nothing to show if this user has no households at all.
  if (all.length === 0 && !active) return null;

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
      // Force reload so all screens re-fetch under the new active household.
      if (typeof window !== 'undefined') window.location.reload();
    } finally {
      setSwitching(false);
    }
  }

  // If no active is set (multi-household user with no Clerk org attached),
  // show a prompt to pick one. The dropdown always works.
  const showing = active ?? all[0] ?? null;
  const label = showing
    ? showing.name.replace(/\s+(household|family|home|house)s?$/i, '')
    : 'Choose household';
  const glyph = showing?.glyph ?? '🏠';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent',
          border: active ? 'none' : `1px solid ${G.hairline2}`,
          borderRadius: active ? 0 : 100,
          padding: active ? 0 : '4px 10px',
          cursor: 'pointer',
          fontFamily: G.sans, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
          color: active ? G.muted : G.ink,
          fontWeight: active ? 400 : 700,
        }}
      >
        <span style={{ fontSize: 14 }}>{glyph}</span>
        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
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
