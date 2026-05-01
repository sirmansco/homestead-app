'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import { G } from './tokens';
import { GTabBar } from './shared';
import { ScreenPost } from './ScreenPost';
import { ScreenShifts } from './ScreenShifts';
import { ScreenAlmanac } from './ScreenAlmanac';
import { ScreenLantern } from './ScreenLantern';
import { ScreenCircle } from './ScreenCircle';
import { ScreenSettings } from './ScreenSettings';
import { ScreenDiagnostics } from './ScreenDiagnostics';
import { HouseholdProvider, useHousehold } from './HouseholdSwitcher';
import { InstallHint } from './InstallHint';
import { getCopy } from '@/lib/copy';

// Role switcher — enabled for emails in NEXT_PUBLIC_DEV_EMAILS (comma-separated).
// Changes only client-side UI; server APIs still enforce real role via DB.
const DEV_EMAILS = (process.env.NEXT_PUBLIC_DEV_EMAILS ?? '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

type TabId = 'almanac' | 'post' | 'circle' | 'shifts' | 'lantern' | 'settings' | 'diagnostics';
type LegacyTabId = TabId | 'village' | 'bell';
type Role = 'parent' | 'caregiver';

function normalizeTabId(id: LegacyTabId): TabId {
  if (id === 'village') return 'circle';
  if (id === 'bell') return 'lantern';
  return id;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); setTimeout(onDone, 300); }, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: 'absolute', bottom: 88, left: 24, right: 24, zIndex: 99,
      transition: 'opacity 0.3s, transform 0.3s',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(10px)',
      pointerEvents: 'none',
    }}>
      <div style={{
        background: G.ink, color: G.bg,
        borderRadius: 100, padding: '12px 20px', textAlign: 'center',
        fontFamily: G.serif, fontStyle: 'italic', fontSize: 13,
        boxShadow: '0 4px 16px rgba(27,23,19,0.25)',
      }}>{msg}</div>
    </div>
  );
}

function useLiveClock() {
  const [time, setTime] = useState(() => {
    const now = new Date();
    return `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(`${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`);
    };
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function RoleSwitcherDesktop({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--bg)', opacity: 0.5, marginBottom: 6 }}>Role</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['parent', 'caregiver'] as Role[]).map(r => (
          <button key={r} onClick={() => onChange(r)} style={{
            flex: 1, padding: '8px 6px', borderRadius: 6,
            background: role === r ? 'var(--bg)' : 'transparent',
            color: role === r ? G.ink : 'var(--bg)',
            border: `1px solid ${role === r ? 'var(--bg)' : 'rgba(255,255,255,0.3)'}`,
            fontFamily: G.sans, fontSize: 10, fontWeight: 700,
            letterSpacing: 0.8, textTransform: 'capitalize', cursor: 'pointer',
          }}>{r}</button>
        ))}
      </div>
    </div>
  );
}

function RoleSwitcherMobile({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Switch role"
        style={{
          position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 78px)', left: 12, zIndex: 200,
          background: 'rgba(27,23,19,0.85)', color: 'var(--bg)',
          border: '1px solid color-mix(in srgb, var(--bg) 25%, transparent)', borderRadius: 100,
          padding: '5px 10px', cursor: 'pointer',
          fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
          textTransform: 'uppercase', backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          opacity: 0.7,
        }}
      >
        Dev · {role === 'parent' ? 'P' : 'C'}
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: G.bg, borderRadius: 16, padding: 20, width: '100%', maxWidth: 320,
          }}>
            <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 22, color: G.ink, marginBottom: 4 }}>
              Switch Role
            </div>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted, marginBottom: 16 }}>
              Demo only — try both perspectives.
            </div>
            {(['parent', 'caregiver'] as Role[]).map(r => (
              <button key={r} onClick={() => { onChange(r); setOpen(false); }} style={{
                display: 'block', width: '100%', marginBottom: 8,
                padding: '14px 16px', textAlign: 'left',
                background: role === r ? G.ink : 'transparent',
                color: role === r ? G.bg : G.ink,
                border: `1px solid ${role === r ? G.ink : G.hairline2}`,
                borderRadius: 8, cursor: 'pointer',
                fontFamily: G.sans, fontSize: 13, fontWeight: 600, letterSpacing: 0.3,
              }}>
                <div style={{ fontFamily: G.display, fontSize: 16, fontWeight: 500, textTransform: 'capitalize' }}>
                  {r}
                </div>
                <div style={{
                  fontFamily: G.serif, fontStyle: 'italic', fontSize: 12,
                  color: role === r ? G.muted : G.muted, marginTop: 2,
                }}>
                  {r === 'parent' ? `Post needs · manage ${getCopy().circle.title.toLowerCase()}` : `Cover ${getCopy().request.tabLabel.toLowerCase()} · answer ${getCopy().urgentSignal.noun.toLowerCase()}s`}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function HomesteadApp() {
  const { user } = useUser();
  const { isDualRole, active, rolesByHousehold } = useHousehold();
  const primaryEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? '';
  const canSwitchRole = !!primaryEmail && DEV_EMAILS.includes(primaryEmail);

  // Seed role from localStorage for allowlisted users so their manual toggle persists.
  const [role, setRole] = useState<Role>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hs.role') as Role | null;
      if (saved === 'parent' || saved === 'caregiver') return saved;
    }
    return 'parent';
  });

  // When the active household changes (Karson switches between families),
  // update role to match her role in that household — unless she's a dev user
  // with a manual override active.
  // rolesByHousehold is keyed by DB household UUID (users.householdId).
  useEffect(() => {
    if (canSwitchRole) return; // dev user: respect their manual toggle
    if (!active?.id) return;
    const r = rolesByHousehold[active.id];
    if (r) setTimeout(() => setRole(r), 0);
  }, [active?.id, rolesByHousehold, canSwitchRole]);
  const [screen, setScreen] = useState<TabId>('almanac');
  const [bellCompose, setBellCompose] = useState(false); // true = skip active-bell check, go straight to compose
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
  const [bellCount, setBellCount] = useState(0);
  const isMobile = useIsMobile();

  // Poll for active bells so the badge stays current
  useEffect(() => {
    if (!user?.id) return;
    const check = () => {
      fetch('/api/bell/active')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          const active = Array.isArray(data.bells) ? data.bells.filter((b: { status: string }) => b.status === 'ringing').length : 0;
          setBellCount(active);
        })
        .catch(() => {});
    };
    check();
    const interval = setInterval(check, 10_000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Role is now kept in sync via the rolesByHousehold effect above, which
  // fires whenever the HouseholdProvider resolves or the active household changes.
  // The manual fetch below is kept only as an initial fallback for cases where
  // the provider hasn't resolved yet when this component first mounts.
  useEffect(() => {
    if (!user?.id || canSwitchRole) return;
    // Only run if rolesByHousehold hasn't populated yet
    if (active?.id && rolesByHousehold[active.id]) return;
    fetch('/api/household')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || canSwitchRole) return;
        if (data.user?.role) setRole(data.user.role as Role);
      })
      .catch(() => {});
  }, [user?.id, canSwitchRole, active?.id, rolesByHousehold]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    // Deep-link from push notification: ?tab=bell (or ?tab=almanac etc.)
    // This runs on app open so tapping a notification lands on the right screen.
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as LegacyTabId | null;
    const validTabs: LegacyTabId[] = ['almanac', 'post', 'circle', 'village', 'shifts', 'lantern', 'bell', 'settings', 'diagnostics'];
    if (tabParam && validTabs.includes(tabParam)) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setScreen(normalizeTabId(tabParam));
      // Clean the URL so the param doesn't persist on refresh
      const clean = new URL(window.location.href);
      clean.searchParams.delete('tab');
      window.history.replaceState({}, '', clean.pathname + (clean.search || ''));
      return; // don't apply localStorage over the deep-link
    }
    const savedScreen = localStorage.getItem('hs.screen') as LegacyTabId | null;
    if (savedScreen) setScreen(normalizeTabId(savedScreen));
  }, []);

  useEffect(() => { localStorage.setItem('hs.screen', screen); }, [screen]);
  useEffect(() => {
    if (canSwitchRole) localStorage.setItem('hs.role', role);
  }, [role, canSwitchRole]);

  const navigate = useCallback((id: TabId) => {
    // Navigating to lantern via tab bar should check for active bells first (not go straight to compose)
    if (id === 'lantern') setBellCompose(false);
    setScreen(id);
    // Re-poll bell count immediately on navigation so the badge reflects current state
    if (id === 'lantern' || id === 'almanac') {
      fetch('/api/bell/active')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          const count = Array.isArray(data.bells) ? data.bells.filter((b: { status: string }) => b.status === 'ringing').length : 0;
          setBellCount(count);
        })
        .catch(() => {});
    }
  }, []);
  const clockTime = useLiveClock();

  // Which tab pill to highlight.
  // For caregivers: bell tab exists, so highlight it. For parents: bell maps to almanac.
  // Settings maps to village for both roles.
  type NavTab = 'almanac' | 'post' | 'circle' | 'shifts' | 'lantern';
  const activeTab: NavTab =
    screen === 'lantern' ? (role === 'caregiver' ? 'lantern' : 'almanac') :
    (screen === 'settings' || screen === 'diagnostics') ? 'circle' :
    screen as NavTab;

  useEffect(() => {
    const parentMap:    TabId[] = ['almanac', 'post',   'circle'];
    const caregiverMap: TabId[] = ['almanac', 'shifts', 'lantern', 'circle'];
    const map = role === 'caregiver' ? caregiverMap : parentMap;
    const handler = (e: KeyboardEvent) => {
      const n = parseInt(e.key);
      if (n >= 1 && n <= map.length) navigate(map[n - 1]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [role, navigate]);

  const handleRing = useCallback(() => { setBellCompose(true); setScreen('lantern'); }, []);

  const handlePost = useCallback((msg?: string) => {
    setToast({ msg: msg || `Posted to ${getCopy().circle.title}`, key: Date.now() });
    setScreen('almanac');
  }, []);

  const handleRoleChange = useCallback((r: Role) => {
    setRole(r);
    setScreen('almanac');
  }, []);

  const renderedScreen = useMemo(() => {
    switch (screen) {
      case 'almanac': return <ScreenAlmanac role={role} isDualRole={isDualRole} onRing={handleRing} onViewBell={() => navigate('lantern')} onPost={() => setScreen('post')} onVillage={() => setScreen('circle')} />;
      case 'post':    return <ScreenPost onCancel={() => setScreen('almanac')} onPost={handlePost} onRing={handleRing} />;
      case 'shifts':  return <ScreenShifts />;
      case 'lantern': return <ScreenLantern key={`lantern-${bellCompose}`} initialCompose={bellCompose} role={role} onBack={() => setScreen('almanac')} onPost={() => setScreen('post')} />;
      case 'circle':  return <ScreenCircle role={role} onOpenSettings={() => setScreen('settings')} />;
      case 'settings': return <ScreenSettings onBack={() => setScreen('circle')} role={role} onOpenDiagnostics={canSwitchRole ? () => setScreen('diagnostics') : undefined} />;
      case 'diagnostics': return <ScreenDiagnostics onBack={() => setScreen('settings')} />;
      default:        return <ScreenAlmanac role={role} isDualRole={isDualRole} onRing={handleRing} />;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, role, isDualRole, bellCompose, canSwitchRole, handleRing, handlePost, navigate]);

  // ── MOBILE LAYOUT ────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <HouseholdProvider>
        <div style={{
          position: 'fixed', inset: 0,
          background: G.bg, color: G.ink,
          fontFamily: G.sans,
          display: 'flex', flexDirection: 'column',
        }}>
          {canSwitchRole && <RoleSwitcherMobile role={role} onChange={handleRoleChange} />}
          <div style={{
            flex: 1, overflow: 'hidden', position: 'relative',
            paddingTop: 'env(safe-area-inset-top, 0px)',
          }}>
            {renderedScreen}
          </div>
          <GTabBar active={activeTab} onNavigate={navigate} role={role} bellCount={bellCount} />
          {toast && <Toast key={toast.key} msg={toast.msg} onDone={() => setToast(null)} />}
          <InstallHint />
        </div>
      </HouseholdProvider>
    );
  }

  // ── DESKTOP LAYOUT (phone frame) ─────────────────────────────────────────
  return (
    <HouseholdProvider>
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#1a120b', gap: 32, padding: '24px 16px', flexWrap: 'wrap',
    }}>
      <div style={{ width: 140, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          fontFamily: G.display, fontStyle: 'italic', fontSize: 18, color: 'var(--bg)',
          marginBottom: 24, lineHeight: 1.2,
        }}>{getCopy().brand.name}</div>
        {canSwitchRole && <RoleSwitcherDesktop role={role} onChange={handleRoleChange} />}
        <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--bg)', opacity: 0.5, marginBottom: 8 }}>Shortcuts</div>
        {(role === 'parent'
          ? [['1', 'Almanac'], ['2', 'Post'], ['3', getCopy().circle.title]]
          : [['1', 'Open'], ['2', 'Schedule'], ['3', getCopy().urgentSignal.noun], ['4', getCopy().circle.title]]
        ).map(([k, l]) => (
          <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'center' }}>
            <div style={{
              width: 18, height: 18, borderRadius: 4,
              background: 'rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: G.sans, fontSize: 10, fontWeight: 700, color: 'var(--bg)',
            }}>{k}</div>
            <span style={{ fontFamily: G.sans, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{l}</span>
          </div>
        ))}
      </div>

      {/* Phone frame */}
      <div style={{
        width: 402, height: 874, borderRadius: 52, overflow: 'hidden',
        position: 'relative', background: G.bg,
        boxShadow: '0 30px 60px rgba(40,30,20,0.22), 0 0 0 8px #0e0906, 0 0 0 10px #2a1e14',
        fontFamily: G.sans, color: G.ink, flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)',
          width: 112, height: 33, borderRadius: 22, background: '#1a120b', zIndex: 55,
        }} />
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', justifyContent: 'space-between', padding: '18px 28px 6px',
          fontFamily: '-apple-system, system-ui', fontWeight: 600, fontSize: 15, color: G.ink,
          zIndex: 40,
        }}>
          <span>{clockTime}</span>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <svg width="17" height="11" viewBox="0 0 17 11">
              <rect x="0" y="7" width="3" height="4" rx="0.6" fill={G.ink} />
              <rect x="4.5" y="5" width="3" height="6" rx="0.6" fill={G.ink} />
              <rect x="9" y="2.5" width="3" height="8.5" rx="0.6" fill={G.ink} />
              <rect x="13.5" y="0" width="3" height="11" rx="0.6" fill={G.ink} />
            </svg>
            <svg width="25" height="12" viewBox="0 0 27 13">
              <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke={G.ink} strokeOpacity="0.4" fill="none" />
              <rect x="2" y="2" width="18" height="9" rx="1.6" fill={G.ink} />
            </svg>
          </div>
        </div>
        <div style={{ position: 'absolute', top: 44, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
          {renderedScreen}
        </div>
        <GTabBar active={activeTab} onNavigate={navigate} role={role} bellCount={bellCount} />
        <div style={{
          position: 'absolute', bottom: 6, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', zIndex: 60,
        }}>
          <div style={{ width: 134, height: 5, borderRadius: 100, background: 'rgba(27,23,19,0.4)' }} />
        </div>
        {toast && <Toast key={toast.key} msg={toast.msg} onDone={() => setToast(null)} />}
      </div>

      <div style={{ width: 140, flexShrink: 0 }}>
        <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.7 }}>
          <div>{getCopy().brand.name}</div>
          <div>Family childcare</div>
          <div>coordination</div>
          <br />
          <div>Design prototype</div>
          <div>Oct 2025</div>
        </div>
      </div>
    </div>
    </HouseholdProvider>
  );
}
