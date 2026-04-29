'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { UserButton, useUser, useClerk } from '@clerk/nextjs';
import Link from 'next/link';
import { G } from './tokens';
import { GMasthead, GLabel } from './shared';
import { requestPushPermission } from './PushRegistrar';

type NotifPrefs = {
  notifyShiftPosted: boolean;
  notifyShiftClaimed: boolean;
  notifyShiftReleased: boolean;
  notifyBellRinging: boolean;
  notifyBellResponse: boolean;
};

const PREF_LABELS: { key: keyof NotifPrefs; label: string; forRole: 'parent' | 'caregiver' | 'both' }[] = [
  { key: 'notifyShiftPosted', label: 'New shifts available', forRole: 'caregiver' },
  { key: 'notifyShiftClaimed', label: 'Shift claimed by caregiver', forRole: 'parent' },
  { key: 'notifyShiftReleased', label: 'Shift released / unclaimed', forRole: 'parent' },
  { key: 'notifyBellRinging', label: 'Family rings the bell', forRole: 'caregiver' },
  { key: 'notifyBellResponse', label: 'Caregiver responds to bell', forRole: 'parent' },
];

type Theme = 'system' | 'light' | 'dark';

function getStoredTheme(): Theme {
  try { return (localStorage.getItem('homestead-theme') as Theme) || 'system'; } catch { return 'system'; }
}

function applyTheme(t: Theme) {
  try {
    if (t === 'system') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('homestead-theme');
    } else {
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('homestead-theme', t);
    }
  } catch { /* ignore private-mode errors */ }
}

export function ScreenSettings({ onBack, role, onOpenDiagnostics }: { onBack?: () => void; role?: 'parent' | 'caregiver'; onOpenDiagnostics?: () => void }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [deletingState, setDeletingState] = useState<'idle' | 'confirming' | 'deleting' | 'done' | 'error'>('idle');
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportFilename, setExportFilename] = useState<string>('homestead-export.json');
  const [exportingState, setExportingState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Calendar feed
  const [calFeedUrl, setCalFeedUrl] = useState<string | null>(null);
  const [calFeedState, setCalFeedState] = useState<'idle' | 'loading' | 'copied' | 'error'>('idle');

  // Notification preferences state
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState<keyof NotifPrefs | null>(null);

  // Push permission state — lazy init reads window.Notification only on client
  type PermState = 'unsupported' | 'default' | 'granted' | 'denied' | 'requesting';
  const [permState, setPermState] = useState<PermState>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission as PermState;
  });

  async function handleEnableNotifications() {
    setPermState('requesting');
    const result = await requestPushPermission();
    setPermState(result.ok ? 'granted' : (Notification.permission as PermState));
  }

  // Theme
  const [theme, setTheme] = useState<Theme>('system');
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTheme(getStoredTheme()); }, []);
  function handleTheme(t: Theme) {
    setTheme(t);
    applyTheme(t);
  }

  // Feedback
  const [feedbackKind, setFeedbackKind] = useState<'bug' | 'idea' | 'general'>('general');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [feedbackState, setFeedbackState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  const loadPrefs = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        if (data.prefs) setPrefs(data.prefs);
      }
    } catch { /* ignore */ }
    setPrefsLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadPrefs(); }, [loadPrefs]);

  async function togglePref(key: keyof NotifPrefs) {
    if (!prefs || prefsSaving) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);          // optimistic
    setPrefsSaving(key);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next[key] }),
      });
    } catch {
      setPrefs(prefs);       // revert on error
    }
    setPrefsSaving(null);
  }

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
      setExportFilename(`homestead-export-${Date.now()}.json`);
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
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch { /* ignore quota/private-mode errors */ }
      await signOut({ redirectUrl: '/' });
    } catch (e) {
      setDeletingState('error');
      setErrorMsg(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function handleGetCalFeed() {
    setCalFeedState('loading');
    try {
      // Session-authenticated call — server generates token and redirects to token URL.
      // We follow the redirect and capture the final URL rather than the ICS body.
      const res = await fetch('/api/shifts/ical', { redirect: 'follow' });
      if (!res.ok) throw new Error(`${res.status}`);
      setCalFeedUrl(res.url);
      setCalFeedState('idle');
    } catch {
      setCalFeedState('error');
    }
  }

  async function handleCopyCalFeed() {
    if (!calFeedUrl) return;
    try {
      await navigator.clipboard.writeText(calFeedUrl);
      setCalFeedState('copied');
      setTimeout(() => setCalFeedState('idle'), 2000);
    } catch {
      setCalFeedState('error');
    }
  }

  async function handleFeedback() {
    if (!feedbackMsg.trim() || feedbackState === 'submitting') return;
    setFeedbackState('submitting');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: feedbackMsg.trim(), kind: feedbackKind }),
      });
      if (!res.ok) throw new Error(`Submit failed (${res.status})`);
      setFeedbackState('done');
      setFeedbackMsg('');
      setTimeout(() => setFeedbackState('idle'), 3000);
    } catch {
      setFeedbackState('error');
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
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px 100px' }}>
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

        {/* Notification preferences */}
        <div style={{ marginBottom: 28 }}>
          <GLabel>Notifications</GLabel>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginTop: 4, lineHeight: 1.5 }}>
            Choose what Homestead can alert you about.
          </div>

          {/* OS-level push permission row */}
          {permState !== 'unsupported' && (
            <div style={{
              marginTop: 12, padding: '12px 14px', borderRadius: 8,
              background: permState === 'granted' ? G.greenSoft : G.claySoft,
              border: `1px solid ${permState === 'granted' ? G.green : G.clay}`,
            }}>
              {permState === 'granted' && (
                <div style={{ fontFamily: G.display, fontSize: 14, color: G.green, fontWeight: 500 }}>
                  Push notifications enabled
                </div>
              )}
              {permState === 'denied' && (
                <>
                  <div style={{ fontFamily: G.display, fontSize: 14, color: G.clay, fontWeight: 500 }}>
                    Notifications blocked
                  </div>
                  <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.ink2, marginTop: 4, lineHeight: 1.5 }}>
                    Re-enable in your device Settings → Homestead (or your browser site settings), then return here.
                  </div>
                </>
              )}
              {(permState === 'default' || permState === 'requesting') && (
                <>
                  <div style={{ fontFamily: G.display, fontSize: 14, color: G.clay, fontWeight: 500 }}>
                    Push notifications off
                  </div>
                  <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.ink2, marginTop: 4, lineHeight: 1.5 }}>
                    On iPhone, add Homestead to your home screen first, then enable here.
                  </div>
                  <button
                    onClick={handleEnableNotifications}
                    disabled={permState === 'requesting'}
                    style={{
                      marginTop: 10, padding: '9px 14px', borderRadius: 8,
                      background: G.ink, color: G.bg, border: 'none',
                      fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
                      textTransform: 'uppercase',
                      cursor: permState === 'requesting' ? 'wait' : 'pointer',
                      opacity: permState === 'requesting' ? 0.6 : 1,
                    }}
                  >
                    {permState === 'requesting' ? 'Requesting…' : 'Enable notifications'}
                  </button>
                </>
              )}
            </div>
          )}

          {prefsLoading ? (
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginTop: 10 }}>
              Loading…
            </div>
          ) : prefs ? (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 0 }}>
              {PREF_LABELS
                .filter(p => p.forRole === 'both' || !role || p.forRole === role)
                .map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => togglePref(key)}
                    disabled={prefsSaving === key}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '13px 0',
                      background: 'transparent', border: 'none',
                      borderBottom: `1px solid ${G.hairline}`,
                      cursor: prefsSaving === key ? 'wait' : 'pointer',
                      opacity: prefsSaving === key ? 0.6 : 1,
                      width: '100%',
                    }}
                  >
                    <span style={{ fontFamily: G.display, fontSize: 15, fontWeight: 500, color: G.ink }}>
                      {label}
                    </span>
                    {/* Toggle pill */}
                    <span style={{
                      width: 44, height: 26, borderRadius: 13,
                      background: prefs[key] ? G.green : G.hairline2,
                      display: 'flex', alignItems: 'center',
                      transition: 'background 0.2s',
                      padding: '0 3px',
                      flexShrink: 0,
                    }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: '50%', background: G.paper,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        transform: prefs[key] ? 'translateX(18px)' : 'translateX(0)',
                        transition: 'transform 0.2s',
                        display: 'block',
                      }} />
                    </span>
                  </button>
                ))}
            </div>
          ) : (
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginTop: 10 }}>
              Could not load preferences.
            </div>
          )}
        </div>

        {/* Appearance */}
        <div style={{ marginBottom: 28 }}>
          <GLabel>Appearance</GLabel>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginTop: 4, lineHeight: 1.5 }}>
            Choose your preferred color scheme.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {(['system', 'light', 'dark'] as Theme[]).map(t => (
              <button
                key={t}
                onClick={() => handleTheme(t)}
                style={{
                  flex: 1, padding: '9px 0',
                  background: theme === t ? G.ink : 'transparent',
                  color: theme === t ? G.bg : G.ink,
                  border: `1px solid ${theme === t ? G.ink : G.hairline2}`,
                  borderRadius: 8,
                  fontFamily: G.sans, fontSize: 11, fontWeight: 700,
                  letterSpacing: 1.2, textTransform: 'capitalize',
                  cursor: 'pointer',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Feedback */}
        <div style={{ marginBottom: 28 }}>
          <GLabel>Feedback</GLabel>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginTop: 4, lineHeight: 1.5 }}>
            Bug, idea, or anything else — we read it all.
          </div>
          {feedbackState === 'done' ? (
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: G.greenSoft, border: `1px solid ${G.green}` }}>
              <div style={{ fontFamily: G.display, fontSize: 14, color: G.green, fontWeight: 500 }}>Thanks for the feedback!</div>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {(['bug', 'idea', 'general'] as const).map(k => (
                  <button
                    key={k}
                    onClick={() => setFeedbackKind(k)}
                    style={{
                      padding: '6px 12px', borderRadius: 100,
                      background: feedbackKind === k ? G.ink : 'transparent',
                      color: feedbackKind === k ? G.bg : G.ink,
                      border: `1px solid ${feedbackKind === k ? G.ink : G.hairline2}`,
                      fontFamily: G.sans, fontSize: 10, fontWeight: 700,
                      letterSpacing: 1.2, textTransform: 'capitalize',
                      cursor: 'pointer',
                    }}
                  >
                    {k === 'bug' ? '🐛 Bug' : k === 'idea' ? '💡 Idea' : '💬 General'}
                  </button>
                ))}
              </div>
              <textarea
                value={feedbackMsg}
                onChange={e => setFeedbackMsg(e.target.value)}
                placeholder="What's on your mind?"
                rows={4}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: `1px solid ${G.hairline2}`, background: G.paper,
                  color: G.ink, fontFamily: G.serif, fontSize: 16,
                  resize: 'vertical', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {feedbackState === 'error' && (
                <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.clay, marginTop: 6 }}>
                  Could not submit. Try again.
                </div>
              )}
              <button
                onClick={handleFeedback}
                disabled={!feedbackMsg.trim() || feedbackState === 'submitting'}
                style={{
                  marginTop: 10, padding: '10px 16px', borderRadius: 8,
                  background: G.ink, color: G.bg, border: 'none',
                  fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.3,
                  textTransform: 'uppercase',
                  cursor: (!feedbackMsg.trim() || feedbackState === 'submitting') ? 'not-allowed' : 'pointer',
                  opacity: (!feedbackMsg.trim() || feedbackState === 'submitting') ? 0.5 : 1,
                }}
              >
                {feedbackState === 'submitting' ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          )}
        </div>

        {/* Help */}
        <div style={{ marginBottom: 28 }}>
          <GLabel>Help</GLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 8 }}>
            <Link href="/guide" style={settingLink}>How Homestead Works →</Link>
            {onOpenDiagnostics && (
              <button onClick={onOpenDiagnostics} style={{ ...settingLink, background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '14px 0' }}>
                Diagnostics →
              </button>
            )}
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
            <a href={exportUrl} download={exportFilename}
              onClick={() => setTimeout(() => { URL.revokeObjectURL(exportUrl); setExportUrl(null); }, 1000)}
              style={{
                display: 'inline-block', marginTop: 10, padding: '10px 16px', borderRadius: 8,
                background: G.ink, color: G.bg, textDecoration: 'none',
                fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.3,
                textTransform: 'uppercase',
              }}>
              Download export ↓
            </a>
          )}
        </div>

        {/* Calendar export */}
        <div style={{ marginBottom: 28 }}>
          <GLabel>Calendar</GLabel>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginTop: 4, lineHeight: 1.5 }}>
            Subscribe to your shifts in Google or Apple Calendar. The URL is private — anyone with it can see your schedule.
          </div>
          {!calFeedUrl ? (
            <button
              onClick={handleGetCalFeed}
              disabled={calFeedState === 'loading'}
              style={{
                marginTop: 10, padding: '10px 16px', borderRadius: 8,
                background: 'transparent', color: G.ink, border: `1px solid ${G.ink}`,
                fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.3,
                textTransform: 'uppercase',
                cursor: calFeedState === 'loading' ? 'wait' : 'pointer',
                opacity: calFeedState === 'loading' ? 0.6 : 1,
              }}
            >
              {calFeedState === 'loading' ? 'Generating…' : 'Get calendar feed URL'}
            </button>
          ) : (
            <div style={{ marginTop: 10 }}>
              <div style={{
                padding: '8px 10px', borderRadius: 6,
                background: G.paper, border: `1px solid ${G.hairline2}`,
                fontFamily: 'monospace', fontSize: 11, color: G.ink2,
                wordBreak: 'break-all', lineHeight: 1.5,
              }}>
                {calFeedUrl}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={handleCopyCalFeed}
                  style={{
                    padding: '9px 14px', borderRadius: 8,
                    background: calFeedState === 'copied' ? G.green : G.ink,
                    color: G.bg, border: 'none',
                    fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
                    textTransform: 'uppercase', cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  {calFeedState === 'copied' ? 'Copied!' : 'Copy URL'}
                </button>
                <a
                  href={`webcal://${calFeedUrl.replace(/^https?:\/\//, '')}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '9px 14px', borderRadius: 8,
                    background: 'transparent', color: G.ink,
                    border: `1px solid ${G.hairline2}`,
                    fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
                    textTransform: 'uppercase', textDecoration: 'none',
                  }}
                >
                  Open in Calendar
                </a>
              </div>
              {calFeedState === 'error' && (
                <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.clay, marginTop: 6 }}>
                  Could not copy. Try selecting the URL manually.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div style={{
          marginTop: 40, padding: 16, borderRadius: 10,
          border: `1px solid ${G.clay}`, background: G.claySoft,
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
                  background: G.clay, color: G.bg, border: 'none',
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
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: G.claySoft, border: `1px solid ${G.clay}` }}>
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
  borderBottom: `1px solid var(--hairline)`,
  fontFamily: G.display, fontSize: 15, fontWeight: 500, color: G.ink,
  textDecoration: 'none',
};
