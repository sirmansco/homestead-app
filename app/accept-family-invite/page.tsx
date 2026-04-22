'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { G } from '../components/tokens';

function InviteRedirect() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    // Forward any Clerk ticket params to sign-up so the invitation is accepted
    const ticket = params.get('__clerk_ticket');
    if (ticket) {
      router.replace(`/sign-up?__clerk_ticket=${encodeURIComponent(ticket)}`);
    } else {
      // No ticket — just send to sign-up; user can create an account and
      // ask the family to re-invite if this was a stale link.
      router.replace('/sign-up');
    }
  }, [params, router]);

  return (
    <div style={{ maxWidth: 420, textAlign: 'center' }}>
      <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 32, marginBottom: 12 }}>
        Homestead
      </div>
      <div style={{ fontFamily: G.serif, fontStyle: 'italic', color: G.muted }}>
        Taking you to sign up…
      </div>
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
        <InviteRedirect />
      </Suspense>
    </div>
  );
}
