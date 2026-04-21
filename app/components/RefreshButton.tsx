'use client';
import { useState } from 'react';
import { G } from './tokens';

export function RefreshButton() {
  const [spinning, setSpinning] = useState(false);

  function refresh() {
    setSpinning(true);
    window.location.reload();
  }

  return (
    <button
      onClick={refresh}
      aria-label="Check for updates"
      title="Check for updates"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        right: 'calc(12px + 112px)',
        zIndex: 200,
        background: 'rgba(27,23,19,0.85)', color: '#FBF7F0',
        border: '1px solid rgba(251,247,240,0.25)', borderRadius: 100,
        width: 32, height: 32, padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none"
        style={{
          transform: spinning ? 'rotate(360deg)' : 'rotate(0deg)',
          transition: 'transform 0.6s ease-in-out',
        }}
      >
        <path
          d="M21 12a9 9 0 0 1-15.5 6.3M3 12a9 9 0 0 1 15.5-6.3M21 4v5h-5M3 20v-5h5"
          stroke={G.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
