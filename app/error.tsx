'use client';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error('[app:error]', error);
  }, [error]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--ink)',
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
        <div style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--muted)', marginBottom: 28, lineHeight: 1.6 }}>
          {error.digest ? `Reference: ${error.digest}` : 'An unexpected error occurred.'}
        </div>
        <button
          onClick={reset}
          style={{
            padding: '12px 28px',
            background: 'var(--ink)',
            color: 'var(--bg)',
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
    </div>
  );
}
