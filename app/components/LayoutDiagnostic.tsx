'use client';
import React, { useEffect, useState } from 'react';

// URL-gated diagnostic overlay for layout investigation.
// Activate by appending ?diag=layout to the URL.
// Reports: env(safe-area-inset-*), viewport size, devicePixelRatio,
// masthead and tab-bar bounding rects, display-mode (browser vs PWA).
// Not gated by env var — pure runtime URL param, never ships visible
// in production unless explicitly opted into per-load.

type Snap = {
  vw: number;
  vh: number;
  dpr: number;
  displayMode: string;
  safeTop: string;
  safeBottom: string;
  safeLeft: string;
  safeRight: string;
  mastheadRect: { top: number; bottom: number; height: number; width: number } | null;
  navRect: { top: number; bottom: number; height: number; paddingBottom: string } | null;
};

function readSafeArea(side: 'top' | 'bottom' | 'left' | 'right'): string {
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.padding = `0`;
  probe.style[`padding${side[0].toUpperCase()}${side.slice(1)}` as 'paddingTop'] = `env(safe-area-inset-${side}, 0px)`;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe)[`padding${side[0].toUpperCase()}${side.slice(1)}` as 'paddingTop'];
  document.body.removeChild(probe);
  return value;
}

function findMasthead(): HTMLElement | null {
  const candidates = document.querySelectorAll('div');
  for (const el of Array.from(candidates)) {
    const child = el.firstElementChild as HTMLElement | null;
    if (!child) continue;
    if (child.textContent?.trim() === 'Covey' || child.textContent?.trim() === 'Homestead') {
      return el;
    }
  }
  return null;
}

function findNav(): HTMLElement | null {
  const fixed = document.querySelectorAll('div');
  for (const el of Array.from(fixed)) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' && cs.bottom === '0px' && el.querySelectorAll('button').length >= 3) {
      return el;
    }
  }
  return null;
}

export function LayoutDiagnostic() {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [enabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('diag') === 'layout';
  });

  useEffect(() => {
    if (!enabled) return;
    const sample = () => {
      const masthead = findMasthead();
      const nav = findNav();
      const navCs = nav ? getComputedStyle(nav) : null;
      setSnap({
        vw: window.innerWidth,
        vh: window.innerHeight,
        dpr: window.devicePixelRatio,
        displayMode:
          window.matchMedia('(display-mode: standalone)').matches ? 'standalone (PWA)' :
          window.matchMedia('(display-mode: minimal-ui)').matches ? 'minimal-ui' :
          window.matchMedia('(display-mode: fullscreen)').matches ? 'fullscreen' :
          'browser',
        safeTop: readSafeArea('top'),
        safeBottom: readSafeArea('bottom'),
        safeLeft: readSafeArea('left'),
        safeRight: readSafeArea('right'),
        mastheadRect: masthead ? (() => {
          const r = masthead.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
        })() : null,
        navRect: nav && navCs ? (() => {
          const r = nav.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, height: r.height, paddingBottom: navCs.paddingBottom };
        })() : null,
      });
    };
    sample();
    const id = setInterval(sample, 1000);
    window.addEventListener('resize', sample);
    return () => { clearInterval(id); window.removeEventListener('resize', sample); };
  }, [enabled]);

  if (!enabled || !snap) return null;

  const navGap = snap.navRect ? snap.vh - snap.navRect.bottom : null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)', color: '#fff',
      fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
      fontSize: 10, lineHeight: 1.4,
      padding: '6px 10px',
      pointerEvents: 'none',
      whiteSpace: 'pre',
    }}>
{`viewport: ${snap.vw} × ${snap.vh}  dpr: ${snap.dpr}
display-mode: ${snap.displayMode}
safe-area  top: ${snap.safeTop}  bottom: ${snap.safeBottom}  L: ${snap.safeLeft}  R: ${snap.safeRight}
masthead   top: ${snap.mastheadRect?.top.toFixed(1) ?? '?'}  bottom: ${snap.mastheadRect?.bottom.toFixed(1) ?? '?'}  h: ${snap.mastheadRect?.height.toFixed(1) ?? '?'}
nav        top: ${snap.navRect?.top.toFixed(1) ?? '?'}  bottom: ${snap.navRect?.bottom.toFixed(1) ?? '?'}  h: ${snap.navRect?.height.toFixed(1) ?? '?'}
nav padBot: ${snap.navRect?.paddingBottom ?? '?'}
GAP below nav: ${navGap?.toFixed(1) ?? '?'} px (≥ 0 means nav is above viewport bottom)`}
    </div>
  );
}
