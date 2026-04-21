'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { G } from './tokens';
import { GTabBar } from './shared';
import { ScreenHome } from './ScreenHome';
import { ScreenPost } from './ScreenPost';
import { ScreenShifts } from './ScreenShifts';
import { ScreenAlmanac } from './ScreenAlmanac';
import { ScreenBell } from './ScreenBell';
import { ScreenTimeOff } from './ScreenTimeOff';
import { ScreenVillage } from './ScreenVillage';
import { HouseholdProvider } from './HouseholdSwitcher';
import { InstallHint } from './InstallHint';
import { RefreshButton } from './RefreshButton';

const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_CLERK_USER_ID;

type TabId = 'home' | 'almanac' | 'post' | 'bell' | 'village' | 'shifts' | 'timeoff';
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
          position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', right: 12, zIndex: 200,
          background: 'rgba(27,23,19,0.85)', color: '#FBF7F0',
          border: '1px solid rgba(251,247,240,0.25)', borderRadius: 100,
          padding: '6px 12px', cursor: 'pointer',
          fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase', backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        {role === 'parent' ? '👪 Parent' : '🤝 Caregiver'} · Switch
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
  const canSwitchRole = !!DEV_USER_ID && user?.id === DEV_USER_ID;

  const [role, setRole] = useState<Role>('parent');
  const [screen, setScreen] = useState<TabId>('home');
  const [bellCompose, setBellCompose] = useState(false);
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
  const isMobile = useIsMobile();

  // Load real role from API; dev user may override via localStorage
  useEffect(() => {
    fetch('/api/household')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user?.role) {
          const apiRole = data.user.role as Role;
          if (canSwitchRole) {
            const savedRole = localStorage.getItem('hs.role') as Role | null;
            setRole(savedRole ?? apiRole);
          } else {
            setRole(apiRole);
          }
        }
      })
      .catch(() => {});
  }, [user?.id, canSwitchRole]);

  useEffect(() => {
    const savedScreen = localStorage.getItem('hs.screen') as TabId | null;
    if (savedScreen) setScreen(savedScreen);
  }, []);

  useEffect(() => { localStorage.setItem('hs.screen', screen); }, [screen]);
  useEffect(() => {
    if (canSwitchRole) localStorage.setItem('hs.role', role);
  }, [role, canSwitchRole]);

  const navigate = useCallback((id: TabId) => {
    if (id === 'bell') setBellCompose(false);
    setScreen(id);
  }, []);

  useEffect(() => {
    const parentScreens: TabId[]    = ['home', 'almanac', 'post',   'bell', 'village', 'almanac', 'home'];
    const caregiverScreens: TabId[] = ['home', 'shifts',  'bell', 'timeoff', 'village', 'home', 'home'];
    const map = role === 'caregiver' ? caregiverScreens : parentScreens;
    const handler = (e: KeyboardEvent) => {
      const n = parseInt(e.key);
      if (n >= 1 && n <= 7) navigate(map[n - 1]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [role, navigate]);

  const handleRing = useCallback(() => {
    setBellCompose(true);
    setScreen('bell');
  }, []);

  const handlePost = useCallback((msg?: string) => {
    setToast({ msg: msg || 'Posted to the Village', key: Date.now() });
    setScreen('home');
  }, []);

  const handleRoleChange = (r: Role) => {
    setRole(r);
    setScreen('home');
  };

  function renderScreen() {
    switch (screen) {
      case 'home':    return <ScreenHome onRing={handleRing} role={role} />;
      case 'post':    return <ScreenPost onCancel={() => setScreen('home')} onPost={handlePost} />;
      case 'shifts':  return <ScreenShifts />;
      case 'almanac': return <ScreenAlmanac role={role} />;
      case 'bell':    return <ScreenBell initialCompose={bellCompose} role={role} />;
      case 'timeoff': return <ScreenTimeOff />;
      case 'village': return <ScreenVillage />;
      default:        return <ScreenHome onRing={handleRing} role={role} />;
    }
  }

  const currentTab: TabId = screen === 'post' ? 'post' : screen;

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
          <RefreshButton />
          <div style={{
            flex: 1, overflow: 'hidden', position: 'relative',
            paddingTop: 'env(safe-area-inset-top, 0px)',
          }}>
            {renderScreen()}
          </div>
          <GTabBar active={currentTab} onNavigate={navigate} role={role} />
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
          ? [['1', 'Week'], ['2', 'Almanac'], ['3', 'Post'], ['4', 'Bell'], ['5', 'Village']]
          : [['1', 'Week'], ['2', 'Shifts'], ['3', 'Bell'], ['4', 'Time Off'], ['5', 'Village']]
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
        <GTabBar active={currentTab} onNavigate={navigate} role={role} />
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
