'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { G } from './tokens';
import { GTabBar } from './shared';
import { ScreenPost } from './ScreenPost';
import { ScreenShifts } from './ScreenShifts';
import { ScreenAlmanac } from './ScreenAlmanac';
import { ScreenBell } from './ScreenBell';
import { ScreenVillage } from './ScreenVillage';
import { ScreenSettings } from './ScreenSettings';
import { HouseholdProvider, useHousehold } from './HouseholdSwitcher';
import { InstallHint } from './InstallHint';

// Dev-only role switcher — disabled in production builds
// Set NEXT_PUBLIC_DEV_CLERK_USER_ID to enable for a specific Clerk user in preview/dev
const DEV_USER_ID = process.env.NODE_ENV === 'production'
  ? (process.env.NEXT_PUBLIC_DEV_CLERK_USER_ID === 'user_3CeQiFzHv2dCasCCiNx7xGEn8Vu' ? null : null)
  : 'user_3CeQiFzHv2dCasCCiNx7xGEn8Vu';

type TabId = 'almanac' | 'post' | 'village' | 'shifts' | 'bell' | 'settings';
type Role = 'parent' | 'caregiver';

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
      position: 'absolute', bottom: 110, left: 24, right: 24, zIndex: 99,
      transition: 'opacity 0.3s, transform 0.3s',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(10px)',
      pointerEvents: 'none',
    }}>
      <div style={{
        background: G.ink, color: '#FBF7F0',
        borderRadius: 100, padding: '12px 20px', textAlign: 'center',
        fontFamily: G.serif, fontStyle: 'italic', fontSize: 13,
        boxShadow: '0 4px 16px rgba(27,23,19,0.25)',
      }}>{msg}</div>
    </div>
  );
}

function RoleSwitcherDesktop({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#FBF7F0', opacity: 0.5, marginBottom: 6 }}>Role</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['parent', 'caregiver'] as Role[]).map(r => (
          <button key={r} onClick={() => onChange(r)} style={{
            flex: 1, padding: '8px 6px', borderRadius: 6,
            background: role === r ? '#FBF7F0' : 'transparent',
            color: role === r ? G.ink : '#FBF7F0',
            border: `1px solid ${role === r ? '#FBF7F0' : 'rgba(255,255,255,0.3)'}`,
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
          position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)', left: 12, zIndex: 200,
          background: 'rgba(27,23,19,0.85)', color: '#FBF7F0',
          border: '1px solid rgba(251,247,240,0.25)', borderRadius: 100,
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
                color: role === r ? '#FBF7F0' : G.ink,
                border: `1px solid ${role === r ? G.ink : G.hairline2}`,
                borderRadius: 8, cursor: 'pointer',
                fontFamily: G.sans, fontSize: 13, fontWeight: 600, letterSpacing: 0.3,
              }}>
                <div style={{ fontFamily: G.display, fontSize: 16, fontWeight: 500, textTransform: 'capitalize' }}>
                  {r}
                </div>
                <div style={{
                  fontFamily: G.serif, fontStyle: 'italic', fontSize: 12,
                  color: role === r ? 'rgba(251,247,240,0.7)' : G.muted, marginTop: 2,
                }}>
                  {r === 'parent' ? 'Post needs · manage village' : 'Claim shifts · answer bells'}
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
  const { isDualRole } = useHousehold();
  const canSwitchRole = !!DEV_USER_ID && user?.id === DEV_USER_ID;

  // If DEV_USER_ID is set, seed role from localStorage immediately (before Clerk loads)
  const [role, setRole] = useState<Role>(() => {
    if (typeof window !== 'undefined' && DEV_USER_ID) {
      const saved = localStorage.getItem('hs.role') as Role | null;
      if (saved === 'parent' || saved === 'caregiver') return saved;
    }
    return 'parent';
  });
  const [screen, setScreen] = useState<TabId>('almanac');
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
  const [bellCount, setBellCount] = useState(0);
  const isMobile = useIsMobile();

  // Load real role from API — dev user keeps localStorage; others get API role
  useEffect(() => {
    if (!user?.id) return;
    fetch('/api/household')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        // Dev user: localStorage always wins — don't overwrite their manual switch
        if (canSwitchRole) return;
        if (data.isDualRole) { setRole('parent'); return; }
        if (data.user?.role) setRole(data.user.role as Role);
      })
      .catch(() => {});
  }, [user?.id, canSwitchRole]);

  useEffect(() => {
    const savedScreen = localStorage.getItem('hs.screen') as TabId | null;
    if (savedScreen) setScreen(savedScreen);
  }, []);

  useEffect(() => { localStorage.setItem('hs.screen', screen); }, [screen]);
  useEffect(() => {
    if (DEV_USER_ID) localStorage.setItem('hs.role', role);
  }, [role]);

  const navigate = useCallback((id: TabId) => setScreen(id), []);

  // Which tab pill to highlight. Non-nav screens (bell, settings) map to a neighbor.
  type NavTab = 'almanac' | 'post' | 'village' | 'shifts';
  const activeTab: NavTab = screen === 'bell' ? 'almanac' : screen === 'settings' ? 'village' : screen;

  useEffect(() => {
    const parentMap:    TabId[] = ['almanac', 'post',   'village'];
    const caregiverMap: TabId[] = ['almanac', 'village'];
    const map = role === 'caregiver' ? caregiverMap : parentMap;
    const handler = (e: KeyboardEvent) => {
      const n = parseInt(e.key);
      if (n >= 1 && n <= map.length) navigate(map[n - 1]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [role, navigate]);

  const handleRing = useCallback(() => setScreen('bell'), []);

  const handlePost = useCallback((msg?: string) => {
    setToast({ msg: msg || 'Posted to the Village', key: Date.now() });
    setScreen('almanac');
  }, []);

  const handleRoleChange = (r: Role) => {
    setRole(r);
    setScreen('almanac');
  };

  function renderScreen() {
    switch (screen) {
      case 'almanac': return <ScreenAlmanac role={role} isDualRole={isDualRole} onRing={handleRing} onPost={() => setScreen('post')} />;
      case 'post':    return <ScreenPost onCancel={() => setScreen('almanac')} onPost={handlePost} onRing={handleRing} />;
      case 'shifts':  return <ScreenShifts />;
      case 'bell':    return <ScreenBell initialCompose={true} role={role} onBack={() => setScreen('almanac')} onPost={() => setScreen('post')} />;
      case 'village': return <ScreenVillage role={role} onOpenSettings={() => setScreen('settings')} />;
      case 'settings': return <ScreenSettings onBack={() => setScreen('village')} />;
      default:        return <ScreenAlmanac role={role} isDualRole={isDualRole} onRing={handleRing} />;
    }
  }

  // ── MOBILE LAYOUT ────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <HouseholdProvider>
        <div style={{
          position: 'fixed', inset: 0,
          background: G.bg, color: G.ink,
          fontFamily: G.sans,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {canSwitchRole && <RoleSwitcherMobile role={role} onChange={handleRoleChange} />}
          <div style={{
            flex: 1, overflow: 'hidden', position: 'relative',
            paddingTop: 'env(safe-area-inset-top, 0px)',
          }}>
            {renderScreen()}
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
          fontFamily: G.display, fontStyle: 'italic', fontSize: 18, color: '#FBF7F0',
          marginBottom: 24, lineHeight: 1.2,
        }}>Homestead</div>
        {canSwitchRole && <RoleSwitcherDesktop role={role} onChange={handleRoleChange} />}
        <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#FBF7F0', opacity: 0.5, marginBottom: 8 }}>Shortcuts</div>
        {(role === 'parent'
          ? [['1', 'Almanac'], ['2', 'Post'], ['3', 'Village']]
          : [['1', 'Schedule'], ['2', 'Village']]
        ).map(([k, l]) => (
          <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'center' }}>
            <div style={{
              width: 18, height: 18, borderRadius: 4,
              background: 'rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: G.sans, fontSize: 10, fontWeight: 700, color: '#FBF7F0',
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
          <span>9:41</span>
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
          {renderScreen()}
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
          <div>Homestead</div>
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
