'use client';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app:global-error]', error);
  }, [error]);

  return (
    <html>
      <body style={{
        margin: 0,
        minHeight: '100vh',
        background: '#E8DFCE',
        color: '#3A3F3D',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        fontFamily: '"Libre Caslon Text", Georgia, serif',
      }}>
        <div style={{ maxWidth: 360, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontStyle: 'italic', marginBottom: 12 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 14, fontStyle: 'italic', color: '#7A6A4F', marginBottom: 28, lineHeight: 1.6 }}>
            {error.digest ? `Reference: ${error.digest}` : 'An unexpected error occurred.'}
          </div>
          <button
            onClick={reset}
            style={{
              padding: '12px 28px',
              background: '#3A3F3D',
              color: '#E8DFCE',
              border: 'none',
              borderRadius: 999,
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.3,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
