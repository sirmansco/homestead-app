'use client';
import React, { CSSProperties } from 'react';
import { G, RED, avatarColor } from './tokens';
import { getCopy } from '@/lib/copy';

// ── GLabel ────────────────────────────────────────────────────────────────
export function GLabel({ children, color, style = {} }: {
  children: React.ReactNode;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <div style={{
      fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
      color: color || G.muted, fontWeight: 700,
      fontFamily: G.sans, whiteSpace: 'nowrap', ...style,
    }}>{children}</div>
  );
}

// ── GHead ─────────────────────────────────────────────────────────────────
export function GHead({ children, size = 32, italic = false, color, style = {} }: {
  children: React.ReactNode;
  size?: number;
  italic?: boolean;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <h2 style={{
      fontFamily: G.display, fontSize: size, lineHeight: 1.05,
      fontWeight: 400, letterSpacing: '-0.01em',
      color: color || G.green, margin: 0,
      fontStyle: italic ? 'italic' : 'normal', ...style,
    }}>{children}</h2>
  );
}

// ── GAvatar ───────────────────────────────────────────────────────────────
export function GAvatar({ name = '', size = 36, style = {} }: {
  name?: string;
  size?: number;
  style?: CSSProperties;
}) {
  const init = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const bg = avatarColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: size,
      background: bg, color: G.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: G.display, fontSize: size * 0.42, fontWeight: 400,
      flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)', ...style,
    }}>{init}</div>
  );
}

// ── GMasthead ─────────────────────────────────────────────────────────────
// Old props (left, right, title, tagline, folioLeft, folioRight, leftAction, titleColor)
// are accepted but ignored — the new masthead is a fixed wordmark bar.
export function GMasthead({
  rightAction,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ...rest
}: {
  rightAction?: React.ReactNode;
  [key: string]: unknown;
}) {
  return (
    <div style={{
      padding: 'calc(env(safe-area-inset-top, 0px) + 12px) 20px 12px',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: `1px solid ${G.hairline}`,
      background: G.bg,
    }}>
      <div style={{
        fontFamily: G.display,
        fontStyle: 'italic',
        fontWeight: 400,
        fontSize: 28,
        color: G.green,
        lineHeight: 1,
        letterSpacing: '-0.02em',
      }}>
        {getCopy().brand.name}
      </div>
      {rightAction ? rightAction : (
        <svg width="26" height="22" viewBox="-13 -14 30 26" fill="none" aria-hidden="true">
          <ellipse cx="1" cy="1" rx="9.5" ry="6.5" fill={G.cream} stroke={G.green} strokeWidth="1.2"/>
          <circle cx="-7" cy="-4" r="4.6" fill={G.cream} stroke={G.green} strokeWidth="1.2"/>
          <path d="M -9.5,-8 Q -12,-12 -8.5,-12.5 Q -5.5,-12.5 -6.8,-9.2" stroke={G.green} strokeWidth="1.2" fill="none" strokeLinecap="round"/>
          <circle cx="-8.2" cy="-4.8" r="0.8" fill={G.ink}/>
          <path d="M -3.1,-4.2 L 1.2,-2.8 L -2.6,-1.6 Z" fill={G.mustard} stroke={G.green} strokeWidth="0.6" strokeLinejoin="round"/>
          <path d="M 9,0 L 15,-3.5 L 13,2.8 Z" fill={G.green} opacity="0.72"/>
          <path d="M -1,-0.5 Q 2,3.8 7,3" stroke={G.green} strokeWidth="1" fill="none" opacity="0.55" strokeLinecap="round"/>
          <path d="M 0,-2 Q 3,1 7,0.5" stroke={G.green} strokeWidth="0.8" fill="none" opacity="0.45" strokeLinecap="round"/>
        </svg>
      )}
    </div>
  );
}

// ── SectionHead ───────────────────────────────────────────────────────────
export function SectionHead({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 10px' }}>
      <div style={{ width: 24, height: 1, background: G.ink }} />
      <GLabel color={G.ink}>{label}</GLabel>
      <div style={{ flex: 1, height: 1, background: G.hairline }} />
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────
export const Icons = {
  home: (c: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M4 11.5L12 4.5l8 7V20a.5.5 0 01-.5.5h-5v-6h-5v6h-5a.5.5 0 01-.5-.5v-8.5z"
        stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  whistles: (c: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="16" height="16" rx="2" stroke={c} strokeWidth="1.5" />
      <path d="M8 9h8M8 12.5h8M8 16h5" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  post: (c: string) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke={c} strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  perch: (c: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M5 4.5h11a2.5 2.5 0 012.5 2.5v12.5H7.5A2.5 2.5 0 015 17V4.5z"
        stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M5 17a2.5 2.5 0 012.5-2.5h11" stroke={c} strokeWidth="1.5" />
    </svg>
  ),
  bell: (c: string) => (
    <svg width="20" height="22" viewBox="0 0 48 48" fill="none">
      <path d="M24 4 L24 8" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <path d="M16 8 L32 8" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <path d="M18 8 L18 14 L14 14 L14 38 L34 38 L34 14 L30 14 L30 8 Z" fill={c}/>
      <rect x="17" y="17" width="14" height="18" fill="rgba(255,233,168,0.85)"/>
      <path d="M14 38 L34 38" stroke={c} strokeWidth="2"/>
    </svg>
  ),
  lantern: (c: string) => (
    <svg width="24" height="26" viewBox="0 0 24 24" fill="none">
      <path d="M12 2v2" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M8 4h8" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="7" y="6" width="10" height="13" rx="2" stroke={c} strokeWidth="1.5"/>
      <path d="M7 10h10" stroke={c} strokeWidth="1" strokeOpacity="0.4"/>
      <ellipse cx="12" cy="14" rx="2.5" ry="3" fill={c} fillOpacity="0.85"/>
      <path d="M9 19h6" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  village: (c: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3" stroke={c} strokeWidth="1.5" />
      <circle cx="5.5" cy="9.5" r="2" stroke={c} strokeWidth="1.5" />
      <circle cx="18.5" cy="9.5" r="2" stroke={c} strokeWidth="1.5" />
      <path d="M2 19.5c0-2 1.6-3.5 3.5-3.5s3.5 1.5 3.5 3.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15 19.5c0-2 1.6-3.5 3.5-3.5s3.5 1.5 3.5 3.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7.5 19.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

// ── GButton ───────────────────────────────────────────────────────────────
type GButtonVariant = 'primary' | 'danger' | 'ghost';

export function GButton({ children, variant = 'primary', onClick, disabled, style = {}, type = 'button' }: {
  children: React.ReactNode;
  variant?: GButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
  type?: 'button' | 'submit' | 'reset';
}) {
  const base: CSSProperties = {
    fontFamily: G.sans, fontWeight: 600, fontSize: 13,
    border: 'none', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1, padding: '10px 20px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  };
  const variants: Record<GButtonVariant, CSSProperties> = {
    primary: { background: G.green,        color: G.bg },
    danger:  { background: RED,            color: G.bg },
    ghost:   { background: 'transparent',  color: G.ink, border: `1px solid ${G.hairline}` },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

// ── GTabBar ───────────────────────────────────────────────────────────────
type TabId = 'perch' | 'post' | 'circle' | 'whistles' | 'lantern';

export function GTabBar({ active = 'perch', onNavigate, role = 'keeper', bellCount = 0 }: {
  active?: TabId;
  onNavigate?: (id: TabId) => void;
  role?: 'keeper' | 'watcher';
  bellCount?: number;
}) {
  type Tab = { id: TabId; label: string; icon: (c: string) => React.ReactNode; badge?: number };

  const parentTabs: Tab[] = [
    { id: 'perch',   label: getCopy().schedule.title, icon: Icons.perch },
    { id: 'post',    label: 'Whistle', icon: Icons.post },
    { id: 'circle',  label: getCopy().circle.title, icon: Icons.village },
  ];
  const caregiverTabs: Tab[] = [
    { id: 'whistles', label: getCopy().request.tabLabel, icon: Icons.whistles },
    { id: 'lantern',  label: getCopy().urgentSignal.tabLabel, icon: Icons.lantern, badge: bellCount > 0 ? bellCount : undefined },
    { id: 'circle',   label: getCopy().circle.caregiverTitle, icon: Icons.village },
  ];
  const tabs = role === 'watcher' ? caregiverTabs : parentTabs;

  return (
    <div className="safe-area-pb" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
      background: G.bg,
      borderTop: `1px solid ${G.hairline}`,
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
        alignItems: 'center',
        height: 56,
      }}>
        {tabs.map(tab => {
          const isActive = active === tab.id;
          const color = isActive ? G.green : `color-mix(in srgb, ${G.muted} 50%, transparent)`;
          const solidColor = isActive ? G.green : G.muted;
          return (
            <button key={tab.id} onClick={() => onNavigate?.(tab.id)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: 'transparent', border: 'none', padding: '8px 0', cursor: 'pointer',
              position: 'relative', opacity: isActive ? 1 : 0.5,
            }}>
              <div style={{ position: 'relative' }}>
                {tab.icon(solidColor)}
                {!!tab.badge && (
                  <div style={{
                    position: 'absolute', top: -3, right: -3,
                    minWidth: 14, height: 14, borderRadius: 7,
                    background: G.clay, border: `1.5px solid ${G.bg}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: G.sans, fontSize: 8, fontWeight: 700, color: G.bg,
                    padding: '0 2px',
                  }}>{tab.badge > 9 ? '9+' : tab.badge}</div>
                )}
              </div>
              <span style={{
                fontFamily: G.sans, fontSize: 9, fontWeight: 500, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: solidColor,
              }}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
