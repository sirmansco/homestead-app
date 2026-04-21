'use client';
import React, { CSSProperties } from 'react';
import { G, avatarColor } from './tokens';

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
      fontWeight: 500, letterSpacing: '-0.02em',
      color: color || G.ink, margin: 0,
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
      background: bg, color: '#FBF7F0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: G.display, fontSize: size * 0.42, fontWeight: 500,
      flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)', ...style,
    }}>{init}</div>
  );
}

// ── GMasthead ─────────────────────────────────────────────────────────────
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '0.0';
const APP_SHA = process.env.NEXT_PUBLIC_APP_SHA || 'dev';

export function GMasthead({
  left, right, title, tagline,
  folioLeft = `v${APP_VERSION} · ${APP_SHA}`, folioRight = 'Homestead Press',
  leftAction, rightAction, titleColor,
}: {
  left?: string;
  right?: string;
  title: string;
  tagline?: string;
  folioLeft?: string;
  folioRight?: string;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
  titleColor?: string;
}) {
  return (
    <div style={{ padding: '6px 24px 14px', flexShrink: 0, height: 164, boxSizing: 'border-box' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 20 }}>
          {leftAction ? leftAction : (left ? <GLabel>{left}</GLabel> : null)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 20 }}>
          {rightAction ? rightAction : (right ? <GLabel color={G.clay}>{right}</GLabel> : null)}
        </div>
      </div>
      <div style={{ height: 1, background: G.ink, margin: '6px 0 10px', opacity: 0.85 }} />
      <div style={{
        fontFamily: G.display, fontSize: 34, lineHeight: 1.05, fontWeight: 500,
        fontStyle: 'italic', letterSpacing: '-0.02em',
        color: titleColor || G.ink,
        height: 38, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}>{title}</div>
      <div style={{
        fontFamily: G.serif, fontStyle: 'italic', color: G.ink2,
        fontSize: 12.5, marginTop: 6, lineHeight: 1.35,
        height: 34, overflow: 'hidden',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      } as CSSProperties}>{tagline || '\u00A0'}</div>
      <div style={{ height: 1, background: G.ink, marginTop: 10, opacity: 0.85 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <GLabel>{folioLeft}</GLabel>
        <GLabel>{folioRight}</GLabel>
      </div>
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
  shifts: (c: string) => (
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
  almanac: (c: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M5 4.5h11a2.5 2.5 0 012.5 2.5v12.5H7.5A2.5 2.5 0 015 17V4.5z"
        stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M5 17a2.5 2.5 0 012.5-2.5h11" stroke={c} strokeWidth="1.5" />
    </svg>
  ),
  bell: (c: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 3v1.5M6.5 19.5h11M8 19.5L8 12a4 4 0 018 0v7.5M10.5 22h3a1.5 1.5 0 01-3 0z"
        stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

// ── GTabBar ───────────────────────────────────────────────────────────────
type TabId = 'home' | 'almanac' | 'post' | 'bell' | 'village' | 'shifts' | 'timeoff';

export function GTabBar({ active = 'home', onNavigate, role = 'parent' }: {
  active?: TabId;
  onNavigate?: (id: TabId) => void;
  role?: 'parent' | 'caregiver';
}) {
  const parentTabs: { id: TabId; label: string; icon: (c: string) => React.ReactNode; primary?: boolean }[] = [
    { id: 'home',    label: 'Week',    icon: Icons.home },
    { id: 'almanac', label: 'Almanac', icon: Icons.almanac },
    { id: 'post',    label: 'Post',    icon: Icons.post,    primary: true },
    { id: 'bell',    label: 'Bell',    icon: Icons.bell },
    { id: 'village', label: 'Village', icon: Icons.shifts },
  ];
  const caregiverTabs: { id: TabId; label: string; icon: (c: string) => React.ReactNode; primary?: boolean }[] = [
    { id: 'home',    label: 'Week',     icon: Icons.home },
    { id: 'shifts',  label: 'Shifts',   icon: Icons.shifts },
    { id: 'bell',    label: 'Bell',     icon: Icons.bell,   primary: true },
    { id: 'almanac', label: 'Schedule', icon: Icons.almanac },
    { id: 'timeoff', label: 'Time Off', icon: Icons.home },
  ];
  const tabs = role === 'caregiver' ? caregiverTabs : parentTabs;

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30, paddingBottom: 24,
      background: `linear-gradient(180deg, rgba(251,247,240,0) 0%, ${G.bg} 30%)`,
    }}>
      <div style={{
        margin: '0 16px', height: 62,
        background: G.paper,
        border: `1px solid ${G.hairline}`,
        borderRadius: 18,
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
        alignItems: 'center',
        boxShadow: '0 4px 16px rgba(27,23,19,0.07)',
      }}>
        {tabs.map(tab => {
          const isActive = active === tab.id;
          if (tab.primary) {
            return (
              <button key={tab.id} onClick={() => onNavigate?.(tab.id)} style={{
                display: 'flex', justifyContent: 'center',
                background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
              }}>
                <div style={{
                  position: 'relative', top: -18,
                  width: 48, height: 48, borderRadius: 24,
                  background: G.ink,
                  border: `2px solid ${G.paper}`,
                  boxShadow: '0 4px 10px rgba(27,23,19,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{tab.icon('#FBF7F0')}</div>
              </button>
            );
          }
          return (
            <button key={tab.id} onClick={() => onNavigate?.(tab.id)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              color: isActive ? G.ink : G.muted,
              background: 'transparent', border: 'none', padding: '6px 0', cursor: 'pointer',
            }}>
              {tab.icon(isActive ? G.ink : G.muted)}
              <span style={{
                fontFamily: G.sans, fontSize: 9.5, fontWeight: 600, letterSpacing: 0.4,
                textTransform: 'uppercase', color: isActive ? G.ink : G.muted,
              }}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
