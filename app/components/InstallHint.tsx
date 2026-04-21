'use client';
import { useEffect, useState } from 'react';
import { G } from './tokens';

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
    if (localStorage.getItem('hs.installHintDismissed') === '1') return;
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    localStorage.setItem('hs.installHintDismissed', '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
      left: 16, right: 16, zIndex: 500,
      background: G.ink, color: '#FBF7F0',
      borderRadius: 14, padding: '14px 14px 12px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      fontFamily: G.sans,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 26, lineHeight: 1 }}>🏡</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 16, lineHeight: 1.2, marginBottom: 4 }}>
            Add Homestead to your home screen
          </div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12.5, opacity: 0.85, lineHeight: 1.4 }}>
            Tap <span style={{ display: 'inline-block', padding: '0 4px', border: '1px solid rgba(251,247,240,0.4)', borderRadius: 3, fontSize: 11 }}>􀈂</span> Share, then <strong>Add to Home Screen</strong>.
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            background: 'transparent', border: 'none', color: '#FBF7F0',
            fontFamily: G.display, fontSize: 22, lineHeight: 1,
            padding: 0, cursor: 'pointer', opacity: 0.6,
          }}
        >×</button>
      </div>
    </div>
  );
}
