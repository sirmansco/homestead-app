'use client';
import { SignIn } from '@clerk/nextjs';
import { getCopy } from '@/lib/copy';

export default function Page() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#E8DFCE',
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
          color: '#4A5340',
          letterSpacing: '-0.01em',
        }}>
          {getCopy().brand.name}
        </div>
        <div style={{
          fontFamily: '"Libre Caslon Text", Georgia, serif',
          fontStyle: 'italic',
          fontSize: 14,
          color: '#7A6A4F',
          marginTop: 4,
        }}>
          {getCopy().brand.tagline}
        </div>
      </div>
      <SignIn
        appearance={{
          elements: {
            rootBox: { width: '100%', maxWidth: 380 },
            card: { background: '#F4EFE3', border: '1px solid rgba(58,63,61,0.25)', boxShadow: 'none', borderRadius: 10 },
          },
        }}
      />
    </div>
  );
}
