'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { G } from '../components/tokens';

export default function AcceptFamilyInvitePage() {
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'loading' | 'valid' | 'invalid'>('loading');

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    setState('valid');
  }, [token]);

  return (
    <div style={{
      minHeight: '100vh', background: G.bg, color: G.ink, padding: 32,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 32, marginBottom: 12 }}>
          Homestead
        </div>
        {state === 'loading' && (
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', color: G.muted }}>Loading…</div>
        )}
        {state === 'invalid' && (
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', color: G.muted }}>
            This invite link is missing or invalid.
          </div>
        )}
        {state === 'valid' && (
          <>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 16, color: G.ink2, lineHeight: 1.5, marginBottom: 24 }}>
              A caregiver has invited you to link up on Homestead. Accept to create a household for your family — they&rsquo;ll be added to your village automatically.
            </div>
            <div style={{
              padding: 16, borderRadius: 8, border: `1px dashed ${G.hairline2}`,
              fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted,
            }}>
              This accept flow is coming soon. For now, please ask the caregiver to share a direct invite once you&rsquo;ve signed up.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
