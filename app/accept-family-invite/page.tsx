'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { G } from '../components/tokens';
import { getCopy } from '@/lib/copy';

type InviteInfo = {
  fromName: string;
  parentName: string | null;
  parentEmail: string;
  villageGroup: 'covey' | 'field';
};

const GROUP_LABEL: Record<string, string> = {
  covey: getCopy().circle.innerLabel,
  field: getCopy().circle.outerLabel,
};

const btnStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '13px 28px',
  background: G.ink,
  color: G.bg,
  border: 'none',
  borderRadius: 999,
  fontFamily: G.sans,
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 0.3,
  cursor: 'pointer',
  textDecoration: 'none',
};

function InviteContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');
  const [state, setState] = useState<'loading' | 'valid' | 'invalid' | 'used'>('loading');
  const [invite, setInvite] = useState<InviteInfo | null>(null);

  useEffect(() => {
    if (!token) { setTimeout(() => setState('invalid'), 0); return; }

    fetch(`/api/circle/invite-family/accept?token=${encodeURIComponent(token)}`)
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setInvite(data.invite);
          setState('valid');
        } else if (data.error === 'invite_used') {
          setState('used');
        } else {
          setState('invalid');
        }
      })
      .catch(() => setState('invalid'));
  }, [token]);

  return (
    <div style={{ maxWidth: 420, textAlign: 'center' }}>
      <div style={{
        fontFamily: G.display, fontStyle: 'italic', fontSize: 32,
        color: G.ink, marginBottom: 24,
      }}>
        {getCopy().brand.name}
      </div>

      {state === 'loading' && (
        <div style={{ fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 15 }}>
          Checking your invite…
        </div>
      )}

      {state === 'invalid' && (
        <div style={{
          padding: 24, borderRadius: 12, border: `1px solid ${G.hairline2}`,
          background: G.paper,
        }}>
          <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 20, color: G.ink, marginBottom: 8 }}>
            Invite not found
          </div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 14, color: G.muted, lineHeight: 1.5 }}>
            This link may be invalid or expired. Ask the person who invited you to send a new one.
          </div>
        </div>
      )}

      {state === 'used' && (
        <div style={{
          padding: 24, borderRadius: 12, border: `1px solid ${G.hairline2}`,
          background: G.paper,
        }}>
          <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 20, color: G.ink, marginBottom: 8 }}>
            Already accepted
          </div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 14, color: G.muted, lineHeight: 1.5, marginBottom: 20 }}>
            This invite has already been used. If you haven&apos;t signed up yet, ask for a new link.
          </div>
          <button onClick={() => router.push('/sign-in')} style={btnStyle}>
            Sign in →
          </button>
        </div>
      )}

      {state === 'valid' && invite && (
        <div style={{
          padding: 28, borderRadius: 12, border: `1px solid ${G.hairline2}`,
          background: G.paper, textAlign: 'left',
        }}>
          <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 22, color: G.ink, marginBottom: 6, lineHeight: 1.2 }}>
            You&apos;ve been invited
          </div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 14, color: G.muted, marginBottom: 20, lineHeight: 1.5 }}>
            <strong style={{ color: G.ink2 }}>{invite.fromName}</strong> invited you to join their circle on {getCopy().brand.name} as{' '}
            <strong style={{ color: G.ink2 }}>{GROUP_LABEL[invite.villageGroup] ?? invite.villageGroup}</strong>.
          </div>

          <div style={{
            padding: '12px 16px', borderRadius: 8,
            background: G.bg, border: `1px solid ${G.hairline}`,
            marginBottom: 24,
          }}>
            <div style={{ fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: G.muted, marginBottom: 4 }}>
              Invited as
            </div>
            <div style={{ fontFamily: G.display, fontSize: 16, color: G.ink }}>
              {invite.parentName || invite.parentEmail}
            </div>
            {invite.parentName && (
              <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginTop: 2 }}>
                {invite.parentEmail}
              </div>
            )}
          </div>

          <button
            onClick={() => router.push(`/sign-up?token=${encodeURIComponent(token!)}`)}
            style={{ ...btnStyle, width: '100%', textAlign: 'center' }}
          >
            Create your account →
          </button>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginTop: 12, textAlign: 'center', lineHeight: 1.4 }}>
            Already have an account?{' '}
            <span
              onClick={() => router.push('/sign-in')}
              style={{ color: G.ink, textDecoration: 'underline', cursor: 'pointer' }}
            >
              Sign in instead
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AcceptFamilyInvitePage() {
  return (
    <div style={{
      minHeight: '100vh', background: G.bg, color: G.ink, padding: 32,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Suspense fallback={
        <div style={{ fontFamily: G.serif, fontStyle: 'italic', color: G.muted }}>Loading…</div>
      }>
        <InviteContent />
      </Suspense>
    </div>
  );
}
