'use client';
import { SignIn } from '@clerk/nextjs';

export default function Page() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#FBF7F0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: '"Inter Tight", system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          fontFamily: '"Fraunces", Georgia, serif',
          fontSize: 40,
          fontStyle: 'italic',
          fontWeight: 500,
          color: '#1c1a17',
          letterSpacing: '-0.01em',
        }}>
          Homestead
        </div>
        <div style={{
          fontFamily: '"Spectral", Georgia, serif',
          fontStyle: 'italic',
          fontSize: 14,
          color: '#6b6560',
          marginTop: 4,
        }}>
          Welcome home.
        </div>
      </div>
      <SignIn
        appearance={{
          elements: {
            rootBox: { width: '100%', maxWidth: 380 },
            card: { background: '#fff', border: '1px solid #1c1a17', boxShadow: 'none', borderRadius: 10 },
          },
        }}
      />
    </div>
  );
}
