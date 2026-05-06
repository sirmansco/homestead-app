'use client';
import { SignUp } from '@clerk/nextjs';
import { getCopy } from '@/lib/copy';

export default function Page() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: '"Inter", system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          fontFamily: '"Libre Caslon Text", Georgia, serif',
          fontSize: 40,
          fontStyle: 'italic',
          fontWeight: 400,
          color: 'var(--green)',
          letterSpacing: '-0.01em',
        }}>
          {getCopy().brand.name}
        </div>
        <div style={{
          fontFamily: '"Libre Caslon Text", Georgia, serif',
          fontStyle: 'italic',
          fontSize: 14,
          color: 'var(--muted)',
          marginTop: 4,
        }}>
          {getCopy().brand.tagline}
        </div>
      </div>
      <SignUp
        appearance={{
          elements: {
            rootBox: { width: '100%', maxWidth: 380 },
            card: { background: 'var(--paper)', border: '1px solid rgba(58,63,61,0.25)', boxShadow: 'none', borderRadius: 10 },
          },
        }}
      />
    </div>
  );
}
