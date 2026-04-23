'use client';
import React, { useState } from 'react';
import { UserButton, useUser, useClerk } from '@clerk/nextjs';
import Link from 'next/link';
import { G } from './tokens';
import { GMasthead, GLabel } from './shared';

export function ScreenSettings({ onBack }: { onBack?: () => void }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [deletingState, setDeletingState] = useState<'idle' | 'confirming' | 'deleting' | 'done' | 'error'>('idle');
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportingState, setExportingState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleExport() {
    setExportingState('loading');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/account');
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      setExportUrl(url);
      setExportingState('idle');
    } catch (e) {
      setExportingState('error');
      setErrorMsg(e instanceof Error ? e.message : 'Export failed');
    }
  }

  async function handleDelete() {
    setDeletingState('deleting');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/account?confirm=yes-delete-my-data', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Delete failed (${res.status})`);
      }
      setDeletingState('done');
      // Clear client storage so nothing lingers after we sign the user out.
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch { /* ignore quota/private-mode errors */ }
      // signOut destroys the Clerk session in this browser; the Clerk account
      // itself was deleted server-side. Redirect home so the app doesn't keep
      // rendering against a dead identity.
      await signOut({ redirectUrl: '/' });
    } catch (e) {
      setDeletingState('error');
      setErrorMsg(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: G.bg, color: G.ink }}>
      <GMasthead
        leftAction={onBack ? (
          <button onClick={onBack} style={{ fontFamily: G.display, fontSize: 26, color: G.ink, lineHeight: 1, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>×</button>
        ) : undefined}
        rightAction={<UserButton />}
        title="Settings"
        tagline="Your account, your data, the legal stuff."
        folioLeft="No. 142" folioRight="Homestead Press"
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px 120px' }}>
        {user && (
          <div style={{ marginBottom: 28 }}>
            <GLabel>Signed in as</GLabel>
            <div style={{ fontFamily: G.display, fontSize: 18, marginTop: 6 }}>
              {user.fullName || user.primaryEmailAddress?.emailAddress}
            </div>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted, marginTop: 2 }}>
              {user.primaryEmailAddress?.emailAddress}
            </div>
          </div>
        )}

        {/* Help */}
        <div style={{ marginBottom: 28 }}>
          <GLabel>Help</GLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 8 }}>
            <Link href="/guide" style={settingLink}>How Homestead Works →</Link>
          </div>
        </div>

        {/* Legal */}
        <div style={{ marginBottom: 28 }}>
          <GLabel>Legal</GLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 8 }}>
            <Link href="/privacy" style={settingLink}>Privacy Policy →</Link>
            <Link href="/terms" style={settingLink}>Terms of Service →</Link>
          </div>
        </div>

        {/* Data export */}
        <div style={{ marginBottom: 28 }}>
          <GLabel>Your data</GLabel>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginTop: 4, lineHeight: 1.5 }}>
            Download everything you&rsquo;ve put into Homestead — shifts, bells, village, unavailability.
          </div>
          {!exportUrl ? (
            <button onClick={handleExport} disabled={exportingState === 'loading'} style={{
              marginTop: 10, padding: '10px 16px', borderRadius: 8,
              background: 'transparent', color: G.ink, border: `1px solid ${G.ink}`,
              fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.3,
              textTransform: 'uppercase', cursor: exportingState === 'loading' ? 'wait' : 'pointer',
              opacity: exportingState === 'loading' ? 0.6 : 1,
            }}>
              {exportingState === 'loading' ? 'Preparing…' : 'Export my data'}
            </button>
          ) : (
            <a href={exportUrl} download={`homestead-export-${Date.now()}.json`}
              onClick={() => setTimeout(() => { URL.revokeObjectURL(exportUrl); setExportUrl(null); }, 1000)}
              style={{
                display: 'inline-block', marginTop: 10, padding: '10px 16px', borderRadius: 8,
                background: G.ink, color: '#FBF7F0', textDecoration: 'none',
                fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.3,
                textTransform: 'uppercase',
              }}>
              Download export ↓
            </a>
          )}
        </div>

        {/* Danger zone */}
        <div style={{
          marginTop: 40, padding: 16, borderRadius: 10,
          border: `1px solid ${G.clay}`, background: '#FFF5F0',
        }}>
          <GLabel color={G.clay}>Danger zone</GLabel>
          <div style={{ fontFamily: G.display, fontSize: 18, marginTop: 6, fontWeight: 500 }}>
            Delete my data
          </div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.ink2, marginTop: 6, lineHeight: 1.5 }}>
            Permanently removes your profile, push subscriptions, availability blocks, and pending invites.
            Future shifts you created are cancelled. Your Clerk login is also deleted — you will be signed out immediately.
          </div>

          {deletingState === 'idle' && (
            <button onClick={() => setDeletingState('confirming')} style={{
              marginTop: 12, padding: '10px 16px', borderRadius: 8,
              background: 'transparent', color: G.clay, border: `1px solid ${G.clay}`,
              fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.3,
              textTransform: 'uppercase', cursor: 'pointer',
            }}>Delete my account</button>
          )}

          {deletingState === 'confirming' && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontFamily: G.sans, fontSize: 12, color: G.clay, fontWeight: 700, marginBottom: 8 }}>
                This cannot be undone. Are you sure?
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleDelete} style={{
                  padding: '10px 16px', borderRadius: 8,
                  background: G.clay, color: '#FBF7F0', border: 'none',
                  fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.3,
                  textTransform: 'uppercase', cursor: 'pointer',
                }}>Yes, delete</button>
                <button onClick={() => setDeletingState('idle')} style={{
                  padding: '10px 16px', borderRadius: 8,
                  background: 'transparent', color: G.ink, border: `1px solid ${G.hairline2}`,
                  fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.3,
                  textTransform: 'uppercase', cursor: 'pointer',
                }}>Cancel</button>
              </div>
            </div>
          )}

          {deletingState === 'deleting' && (
            <div style={{ marginTop: 12, fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 13 }}>
              Deleting your data…
            </div>
          )}

          {deletingState === 'done' && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: G.paper, border: `1px solid ${G.green}` }}>
              <div style={{ fontFamily: G.display, fontSize: 14, color: G.green, fontWeight: 500 }}>Your data has been deleted.</div>
              <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.ink2, marginTop: 4 }}>
                Signing you out…
              </div>
            </div>
          )}

          {deletingState === 'error' && errorMsg && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: '#FFE6DA', border: `1px solid ${G.clay}` }}>
              <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.clay }}>{errorMsg}</div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 32, textAlign: 'center', fontFamily: G.serif, fontStyle: 'italic', fontSize: 11, color: G.muted, lineHeight: 1.6 }}>
          Homestead · family childcare coordination
          <br />
          <span style={{ fontSize: 10, opacity: 0.6 }}>
            build {process.env.NEXT_PUBLIC_APP_SHA || 'dev'}
          </span>
        </div>
      </div>
    </div>
  );
}

const settingLink: React.CSSProperties = {
  display: 'block', padding: '14px 0',
  borderBottom: `1px solid ${G.hairline}`,
  fontFamily: G.display, fontSize: 15, fontWeight: 500, color: G.ink,
  textDecoration: 'none',
};
