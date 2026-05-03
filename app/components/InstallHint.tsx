'use client';
import { useEffect, useState } from 'react';
import { G } from './tokens';
import { getCopy } from '@/lib/copy';

function isIosSafari() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && notChrome;
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function InstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isIosSafari() || isStandalone()) return;
    if (localStorage.getItem('covey.installHintDismissed') === '1' || localStorage.getItem('hs.installHintDismissed') === '1') return;
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    localStorage.setItem('covey.installHintDismissed', '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
      left: 16, right: 16, zIndex: 500,
      background: G.ink, color: G.bg,
      borderRadius: 14, padding: '14px 14px 12px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      fontFamily: G.sans,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#4A5340', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="28" height="24" viewBox="-13 -14 30 26" fill="none">
            <ellipse cx="1" cy="1" rx="9.5" ry="6.5" fill="#EDE5D6"/>
            <circle cx="-7" cy="-4" r="4.6" fill="#EDE5D6"/>
            <path d="M -9.5,-8 Q -12,-12 -8.5,-12.5 Q -5.5,-12.5 -6.8,-9.2" stroke="#EDE5D6" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
            <circle cx="-8.2" cy="-4.8" r="0.8" fill="#3A3F3D"/>
            <path d="M -3.1,-4.2 L 1.2,-2.8 L -2.6,-1.6 Z" fill="#D9A441"/>
            <path d="M 9,0 L 15,-3.5 L 13,2.8 Z" fill="#EDE5D6" opacity="0.85"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 16, lineHeight: 1.2, marginBottom: 4 }}>
            Add {getCopy().brand.name} to your home screen
          </div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12.5, opacity: 0.85, lineHeight: 1.4 }}>
            Tap the <strong>Share</strong> button at the bottom of Safari, then <strong>Add to Home Screen</strong>.
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            background: 'transparent', border: 'none', color: G.bg,
            fontFamily: G.display, fontSize: 22, lineHeight: 1,
            padding: 0, cursor: 'pointer', opacity: 0.6,
          }}
        >×</button>
      </div>
    </div>
  );
}
