'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { G, RED, RED_DARK, BELL_BG } from './tokens';
import { GMasthead, GLabel, GAvatar } from './shared';
import { requestPushPermission } from './PushRegistrar';
import { useAppData } from '@/app/context/AppDataContext';
import { shortName } from '@/lib/format';
import { fmtTimeOnly } from '@/lib/format/time';
import { WhenPickerWindow, bellWindowPresets } from './WhenPicker';
import { getCopy } from '@/lib/copy';

function BellPill({ label, value, emphasized }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      border: `1px solid ${emphasized ? RED : G.hairline2}`,
      background: emphasized ? G.claySoft : G.paper,
    }}>
      <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: emphasized ? RED : G.muted, fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: G.display, fontSize: 14, marginTop: 3, fontWeight: 500, color: emphasized ? RED : G.ink }}>{value}</div>
    </div>
  );
}

function BellGlyph({ size = 72 }: { size?: number }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 48 54" fill="none">
      {/* handle */}
      <path d="M24 2v5" stroke={RED} strokeWidth="2" strokeLinecap="round"/>
      {/* top bar */}
      <path d="M16 7h16" stroke={RED} strokeWidth="2" strokeLinecap="round"/>
      {/* body */}
      <rect x="13" y="9" width="22" height="30" rx="4" fill={RED} opacity="0.15" stroke={RED} strokeWidth="1.5"/>
      {/* glass pane */}
      <rect x="17" y="13" width="14" height="20" rx="2" fill={RED} opacity="0.25"/>
      {/* flame */}
      <ellipse cx="24" cy="24" rx="4" ry="5.5" fill={RED}/>
      <path d="M24 18 Q27 21 24 26 Q21 21 24 18Z" fill={RED_DARK}/>
      {/* base */}
      <path d="M13 39h22" stroke={RED} strokeWidth="2" strokeLinecap="round"/>
      <path d="M17 39v4M31 39v4" stroke={RED} strokeWidth="1.5" strokeLinecap="round"/>
      {/* glow arcs */}
      <path d="M8 24 Q3 32 8 40" stroke={RED} strokeWidth="1" strokeLinecap="round" opacity="0.3"/>
      <path d="M40 24 Q45 32 40 40" stroke={RED} strokeWidth="1" strokeLinecap="round" opacity="0.3"/>
    </svg>
  );
}

function Person({ name, state, sub, highlight }: { name: string; state: string; sub: string; highlight?: boolean }) {
  const badge: Record<string, { color: string; mark: string }> = {
    read:        { color: G.muted,  mark: '·' },
    coming:      { color: G.green,  mark: '→' },
    'no-answer': { color: G.clay,   mark: '×' },
    queued:      { color: G.muted,  mark: '◦' },
  };
  const b = badge[state] || badge.queued;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 10px', borderRadius: 6,
      background: highlight ? G.greenSoft : G.paper,
      border: `1px solid ${highlight ? G.green : G.hairline}`,
    }}>
      <GAvatar name={name} size={24} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: G.display, fontSize: 13, fontWeight: 500 }}>{name}</div>
        <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 10, color: G.muted }}>{sub}</div>
      </div>
      <div style={{ fontFamily: G.sans, fontSize: 14, color: b.color, fontWeight: 700 }}>{b.mark}</div>
    </div>
  );
}

function Rung({ ring, label, status, time, people }: {
  ring: number; label: string;
  status: 'rung' | 'queued' | 'pending';
  time: string;
  people: { name: string; state: string; sub: string; highlight?: boolean }[];
}) {
  const ringStyle = {
    rung:    { bg: RED,     ink: 'var(--bg)', label: 'Lit' },
    queued:  { bg: G.paper, ink: G.ink,     label: 'Queued' },
    pending: { bg: G.paper, ink: G.muted,   label: 'If needed' },
  }[status];
  return (
    <div style={{ display: 'flex', gap: 14, paddingBottom: 18, position: 'relative' }}>
      <div style={{
        width: 28, height: 28, borderRadius: 28, flexShrink: 0,
        background: ringStyle.bg, color: ringStyle.ink,
        border: `1px solid ${status === 'rung' ? RED_DARK : G.hairline2}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: G.display, fontSize: 14, fontWeight: 500,
        position: 'relative', zIndex: 2,
      }}>{ring}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <GLabel color={status === 'rung' ? RED : G.ink}>{ringStyle.label}</GLabel>
            <div style={{ fontFamily: G.display, fontSize: 16, fontWeight: 500, marginTop: 2 }}>{label}</div>
          </div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 11, color: G.muted }}>{time}</div>
        </div>
        {people.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {people.map((p) => <Person key={p.name} {...p} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function nowLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function plusHours(h: number) {
  const d = new Date(Date.now() + h * 3600000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type VillageMember = { id: string; name: string; villageGroup: 'covey' | 'field' };

function PushPermissionBanner({ role = 'keeper' }: { role?: 'keeper' | 'watcher' }) {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    if (typeof Notification !== 'undefined') setPermission(Notification.permission);
  }, []);

  if (permission === 'granted' || permission === null) return null;

  const deniedCopy = role === 'watcher'
    ? 'Notifications blocked. Enable them in your browser settings so you\'re alerted when a family lights the lantern.'
    : 'Notifications blocked. Enable them in your browser settings so watchers get alerted when you light the Lantern.';
  const allowCopy = role === 'watcher'
    ? 'Allow notifications so you\'re alerted the moment a family lights the lantern.'
    : 'Allow notifications so caregivers are alerted instantly.';

  return (
    <div style={{
      margin: '12px 0', padding: '12px 14px', borderRadius: 8,
      background: permission === 'denied' ? G.paper : G.claySoft,
      border: `1px solid ${permission === 'denied' ? G.hairline2 : G.mustard}`,
    }}>
      {permission === 'denied' ? (
        <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, lineHeight: 1.5 }}>
          {deniedCopy}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.ink2, lineHeight: 1.4, flex: 1 }}>
            {allowCopy}
          </div>
          <button
            onClick={async () => {
              setRequesting(true);
              const result = await requestPushPermission();
              setPermission(result.ok ? 'granted' : 'denied');
              setRequesting(false);
            }}
            disabled={requesting}
            style={{
              flexShrink: 0, padding: '7px 12px', borderRadius: 6,
              background: G.ink, color: G.bg, border: 'none',
              fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1,
              textTransform: 'uppercase', cursor: 'pointer',
              opacity: requesting ? 0.6 : 1,
            }}
          >{requesting ? '…' : 'Enable'}</button>
        </div>
      )}
    </div>
  );
}

function BellCompose({ onRing, onBack, onPost }: {
  onRing: (bellId: string, label: string, warning?: string) => void;
  onBack?: () => void;
  onPost?: () => void;
}) {
  const [why, setWhy] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState(nowLocal);
  const [endsAt, setEndsAt] = useState(() => plusHours(3));
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Minimum selectable datetime — updated every minute so the constraint stays current
  const [minNow, setMinNow] = useState(nowLocal);
  useEffect(() => {
    const tick = () => setMinNow(nowLocal());
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const reasons = [
    { id: 0, label: 'Sick kid',             desc: 'need someone home, now' },
    { id: 1, label: 'Last-minute conflict', desc: 'appointment, meeting, something came up' },
    { id: 2, label: 'Other',               desc: 'something else came up' },
  ];

  async function handleRing() {
    if (why === null || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/lantern', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reasons[why].label,
          note: note.trim() || undefined,
          startsAt,
          endsAt,
        }),
      });
      // Parse JSON once — calling .json() twice on the same response throws "body already used"
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to ${getCopy().urgentSignal.actionLabel.toLowerCase()}`);
      const noun = getCopy().urgentSignal.noun;
      const n = data.notify as { kind: string } | undefined;
      const warning =
        !n ? null :
        n.kind === 'no_recipients' ? `${noun} lit — but no caregivers have notifications enabled. They'll see it when they open the app.` :
        n.kind === 'vapid_missing' || n.kind === 'push_error' ? `${noun} lit — push delivery failed. Caregivers will see it when they open the app.` :
        n.kind === 'partial' ? `${noun} lit — some caregivers may not have received the push. They'll see it when they open the app.` :
        null;
      onRing(data.bell.id, reasons[why].label, warning ?? undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: BELL_BG, color: G.ink }}>
      <GMasthead
        leftAction={
          <button onClick={onBack} style={{ fontFamily: G.sans, fontSize: 15, fontWeight: 700, letterSpacing: 0.5, color: G.ink, lineHeight: 1, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>‹ Back</button>
        }
        right={getCopy().urgentSignal.actionLabel}
        title={getCopy().urgentSignal.towerTitle}
        titleColor={RED}
        tagline="Something came up — we'll reach the inner circle first, then widen if no one answers."
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 100px' }}>
        <div style={{ marginTop: 10 }}>
          <GLabel color={G.ink}>What&apos;s happening?</GLabel>
          {why === null && (
            <div style={{
              marginTop: 8, padding: '10px 14px', borderRadius: 8,
              border: `1px dashed ${G.hairline2}`, background: 'transparent',
              fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted,
            }}>Select what&apos;s happening…</div>
          )}
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {reasons.map(r => (
              <button key={r.id} onClick={() => setWhy(r.id)} style={{
                textAlign: 'left', padding: '12px 14px', cursor: 'pointer',
                background: why === r.id ? G.paper : 'transparent',
                border: `1px solid ${why === r.id ? RED : G.hairline2}`,
                borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius: 14,
                  border: `1.5px solid ${why === r.id ? RED : G.hairline2}`,
                  background: why === r.id ? RED : 'transparent',
                  boxShadow: why === r.id ? `inset 0 0 0 3px ${G.paper}` : 'none',
                  flexShrink: 0,
                }} />
                <div>
                  <div style={{ fontFamily: G.display, fontSize: 15, fontWeight: 500, color: G.ink }}>{r.label}</div>
                  <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 11, color: G.muted, marginTop: 1 }}>{r.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <GLabel>When</GLabel>
          <div style={{ marginTop: 8 }}>
            <WhenPickerWindow
              startValue={startsAt}
              endValue={endsAt}
              onChange={(s, e) => { setStartsAt(s); setEndsAt(e); }}
              presets={bellWindowPresets}
              accent={RED}
              minNow={minNow}
            />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <GLabel>A short note <span style={{ color: G.muted, fontWeight: 500, letterSpacing: 0.5, textTransform: 'none' }}>· optional</span></GLabel>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What happened, what you need…"
            rows={3}
            style={{
              marginTop: 8, padding: 12, borderRadius: 8, width: '100%',
              border: `1px solid ${G.hairline2}`, background: G.paper,
              fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.ink, lineHeight: 1.4,
              outline: 'none', resize: 'none',
            }}
          />
        </div>

        <div style={{
          marginTop: 22, padding: 14, borderRadius: 8,
          border: `1px dashed ${RED}`, background: G.claySoft,
        }}>
          <GLabel color={RED}>How it&apos;ll reach them</GLabel>
          <div style={{ marginTop: 8, fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.ink2, lineHeight: 1.6 }}>
            <div><b style={{ fontFamily: G.sans, fontStyle: 'normal', fontSize: 11, fontWeight: 700, color: RED, letterSpacing: 1 }}>NOW</b> &nbsp; {getCopy().circle.innerLabel}</div>
            <div><b style={{ fontFamily: G.sans, fontStyle: 'normal', fontSize: 11, fontWeight: 700, color: G.ink2, letterSpacing: 1 }}>+5 MIN</b> &nbsp; {getCopy().circle.outerLabel}</div>
          </div>
        </div>

        <PushPermissionBanner />

        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: G.claySoft, border: `1px solid ${RED}`, fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: RED }}>
            {error}
          </div>
        )}

        <button onClick={handleRing} disabled={why === null || submitting} style={{
          marginTop: 22, width: '100%', padding: '18px 14px',
          background: why === null || submitting ? G.hairline2 : RED,
          color: why === null || submitting ? G.muted : G.bg,
          border: 'none', borderRadius: 8,
          fontFamily: G.sans, fontSize: 13, fontWeight: 700, letterSpacing: 1.8,
          textTransform: 'uppercase', cursor: why === null || submitting ? 'default' : 'pointer',
          boxShadow: why === null || submitting ? 'none' : `0 4px 0 ${RED_DARK}`,
          transition: 'background 0.15s, color 0.15s',
        }}>{submitting ? 'Lighting…' : why === null ? 'Select a reason above' : getCopy().urgentSignal.actionLabel}</button>

        <div style={{ marginTop: 12, textAlign: 'center', fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted }}>
          Not urgent?{' '}
          <button onClick={onPost} style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            color: G.ink, borderBottom: `1px solid ${G.ink}`, paddingBottom: 1,
            fontFamily: G.serif, fontStyle: 'italic', fontSize: 12,
          }}>Post a need instead →</button>
        </div>
      </div>
    </div>
  );
}

type BellResponse = { userId: string; response: string };

function BellRinging({ onBack, onDone, bellId, reason, warning }: { onBack?: () => void; onDone?: () => void; bellId?: string; reason?: string; warning?: string }) {
  const { activeBell, village, refreshBell } = useAppData();
  // Responses come from the shared activeBell state polled by AppDataContext
  const responses: BellResponse[] = (bellId && activeBell?.id === bellId)
    ? (activeBell.responses as BellResponse[]) ?? []
    : [];
  const members = village.length > 0 ? village : null;

  const [marking, setMarking] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [bellError, setBellError] = useState<string | null>(null);

  // Map a village member ID to their response state
  function memberState(memberId: string): string {
    const r = responses.find(resp => resp.userId === memberId);
    if (!r) return 'queued';
    if (r.response === 'on_my_way') return 'coming';
    if (r.response === 'cannot') return 'no-answer';
    return 'read'; // in_thirty = acknowledged but not confirmed
  }

  function memberSub(memberId: string): string {
    const r = responses.find(resp => resp.userId === memberId);
    if (!r) return 'notified';
    if (r.response === 'on_my_way') return 'on the way ✓';
    if (r.response === 'in_thirty') return 'can in 30 min';
    if (r.response === 'cannot') return 'can\'t make it';
    return 'notified';
  }

  const byGroup = (g: 'covey' | 'field') =>
    (members || []).filter(m => m.villageGroup === g);

  const inner  = byGroup('covey');
  const sitter = byGroup('field');

  async function handleMarkDone() {
    if (!bellId || marking) return;
    setMarking(true);
    setBellError(null);
    try {
      const res = await fetch(`/api/lantern/${bellId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'handled' }),
      });
      if (!res.ok) throw new Error('Could not mark as handled');
      refreshBell();
      onDone?.();   // go to compose, stay on Bell tab
    } catch {
      setBellError('Something went wrong. Try again.');
      setMarking(false);
    }
  }

  async function handleCancel() {
    if (!confirmingCancel) { setConfirmingCancel(true); return; }
    setConfirmingCancel(false);
    setBellError(null);
    if (bellId) {
      try {
        const res = await fetch(`/api/lantern/${bellId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled' }),
        });
        if (!res.ok) throw new Error(`Could not cancel ${getCopy().urgentSignal.noun.toLowerCase()}`);
        refreshBell();
        onDone?.();   // go to compose, stay on Bell tab
      } catch {
        setBellError(`Could not cancel the ${getCopy().urgentSignal.noun.toLowerCase()}. Try again.`);
      }
    } else {
      onDone?.();
    }
  }

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: BELL_BG, color: G.ink }}>
      <GMasthead
        leftAction={onBack ? (
          <button onClick={onBack} style={{ fontFamily: G.sans, fontSize: 15, fontWeight: 700, letterSpacing: 0.5, color: G.ink, lineHeight: 1, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>‹ Back</button>
        ) : undefined}
        right="Urgent"
        title={reason || `${getCopy().urgentSignal.noun} ringing`}
        titleColor={RED}
        tagline={`${getCopy().circle.title} is being notified — ${getCopy().circle.innerLabel.toLowerCase()} first, widening if no one answers.`}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 100px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 18px' }}>
          <BellGlyph size={72} />
        </div>

        {members === null ? (
          <div style={{ textAlign: 'center', padding: '20px 0', fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 13 }}>
            {getCopy().circle.loadingState}
          </div>
        ) : members.length === 0 ? (
          <div style={{
            padding: '18px 16px', borderRadius: 8, border: `1px dashed ${RED}`,
            background: G.claySoft, marginTop: 8,
            fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.ink2, lineHeight: 1.5,
          }}>
            No one in {getCopy().circle.title.toLowerCase()} yet. Add caregivers from the {getCopy().circle.title} tab so they can receive {getCopy().urgentSignal.noun.toLowerCase()} alerts.
          </div>
        ) : (
          <>
            <GLabel color={G.ink}>Who&apos;s Being Called</GLabel>
            <div style={{ marginTop: 10, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 14, top: 12, bottom: 12, width: 1, background: G.hairline2 }} />
              <Rung ring={1} label={getCopy().circle.innerLabel} status={inner.length > 0 ? 'rung' : 'pending'} time="Now"
                people={inner.map(m => ({ name: shortName(m.name), state: memberState(m.id), sub: memberSub(m.id), highlight: memberState(m.id) === 'coming' }))} />
              <Rung ring={2} label={getCopy().circle.outerLabel} status={sitter.length > 0 ? 'queued' : 'pending'} time={`If ${getCopy().circle.innerLabel.toLowerCase()} can't`}
                people={sitter.map(m => ({ name: shortName(m.name), state: memberState(m.id), sub: memberSub(m.id), highlight: memberState(m.id) === 'coming' }))} />
            </div>
          </>
        )}

        {warning && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 8,
            background: G.paper, border: `1px solid ${G.clay}`,
            fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.clay,
          }}>{warning}</div>
        )}

        {bellError && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 8,
            background: G.claySoft, border: `1px solid ${RED}`,
            fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: RED,
          }}>{bellError}</div>
        )}
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={handleMarkDone} disabled={marking} style={{
            width: '100%', padding: '14px 12px',
            background: G.ink, color: G.bg,
            border: 'none', borderRadius: 8,
            fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.4,
            textTransform: 'uppercase', cursor: marking ? 'wait' : 'pointer',
            opacity: marking ? 0.6 : 1,
          }}>Someone is on the way · Mark handled</button>
          {confirmingCancel ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCancel} style={{
                flex: 1, padding: '12px 12px',
                background: RED, color: G.bg, border: 'none', borderRadius: 8,
                fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
                textTransform: 'uppercase', cursor: 'pointer',
              }}>Yes, cancel {getCopy().urgentSignal.noun.toLowerCase()}</button>
              <button onClick={() => setConfirmingCancel(false)} style={{
                flex: 1, padding: '12px 12px',
                background: 'transparent', color: G.ink, border: `1px solid ${G.hairline2}`, borderRadius: 8,
                fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
                textTransform: 'uppercase', cursor: 'pointer',
              }}>Keep lit</button>
            </div>
          ) : (
            <button onClick={handleCancel} style={{
              width: '100%', padding: '12px 12px',
              background: 'transparent', color: G.muted,
              border: `1px solid ${G.hairline2}`, borderRadius: 8,
              fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
              textTransform: 'uppercase', cursor: 'pointer',
            }}>Cancel {getCopy().urgentSignal.noun.toLowerCase()} · notify everyone</button>
          )}
        </div>
      </div>
    </div>
  );
}

function BellIncoming() {
  const { allBells, bellLoading, refreshBell } = useAppData();
  const [responding, setResponding] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  async function respond(bellId: string, response: 'on_my_way' | 'in_thirty' | 'cannot') {
    setResponding(bellId + response);
    setRespondError(null);
    try {
      const res = await fetch(`/api/lantern/${bellId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRespondError(data.error || `Couldn't save your response. Tap to try again.`);
        return;
      }
      refreshBell();
    } catch {
      setRespondError(`Couldn't reach ${getCopy().brand.name}. Tap to try again.`);
    } finally {
      setResponding(null);
    }
  }

  const activeBells = allBells.filter(b => b.status === 'ringing');

  if (bellLoading && allBells.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BELL_BG }}>
        <div style={{ fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 13 }}>Checking for {getCopy().urgentSignal.noun.toLowerCase()}s…</div>
      </div>
    );
  }

  if (activeBells.length === 0) {
    return (
      <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: BELL_BG, color: G.ink }}>
        <GMasthead
          left={getCopy().urgentSignal.noun} right="Incoming"
          title="All clear"
          titleColor={G.ink}
          tagline="You'll be notified instantly when a family needs help. Stand by."
        />
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 100px' }}>
          <PushPermissionBanner role="watcher" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.ink2, textAlign: 'center', lineHeight: 1.5, marginBottom: 16 }}>The {getCopy().urgentSignal.noun.toLowerCase()} is how families in {getCopy().circle.title.toLowerCase()} ask for urgent help.</div>
            <BellGlyph size={48} />
            <div style={{ marginTop: 16, fontFamily: G.serif, fontStyle: 'italic', fontSize: 14, color: G.muted, lineHeight: 1.6, textAlign: 'center' }}>
              When someone uses the {getCopy().urgentSignal.noun.toLowerCase()},<br />it will appear here.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: BELL_BG, color: G.ink }}>
      <GMasthead
        left="Incoming · now" right="Urgent"
        title={activeBells.length === 1 ? activeBells[0].reason : `${activeBells.length} ${getCopy().urgentSignal.noun.toLowerCase()}s ringing`}
        titleColor={RED}
        tagline={`Someone in ${getCopy().circle.title.toLowerCase()} needs help. ${getCopy().circle.innerLabel} — you're first.`}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 100px' }}>
        {activeBells.map(bell => {
          const myResp = bell.myResponse;
          const rungAt = new Date(bell.createdAt);
          const secondsAgo = Math.floor((now - rungAt.getTime()) / 1000);
          const timeAgo = secondsAgo < 60 ? `${secondsAgo}s ago` : `${Math.floor(secondsAgo / 60)}m ago`;

          return (
            <div key={bell.id} style={{
              background: G.paper, border: `1px solid ${RED}`, borderRadius: 10,
              padding: 18, marginTop: 8, position: 'relative',
              boxShadow: '0 8px 24px rgba(181,52,43,0.12)',
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <GLabel color={RED}>What&apos;s happening</GLabel>
                <span style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 11, color: G.muted }}>{timeAgo}</span>
              </div>
              <div style={{ fontFamily: G.display, fontSize: 20, fontWeight: 500, color: G.ink, lineHeight: 1.2 }}>
                {bell.reason}
              </div>
              {bell.note && (
                <div style={{ fontFamily: G.serif, fontStyle: 'italic', color: G.ink2, fontSize: 13, marginTop: 6, lineHeight: 1.4 }}>
                  &ldquo;{bell.note}&rdquo;
                </div>
              )}
              <div style={{ height: 1, background: G.hairline, margin: '14px 0' }} />
              <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted }}>
                Needed from {fmtTimeOnly(bell.startsAt ?? bell.createdAt)} until {fmtTimeOnly(bell.endsAt)}
              </div>

              {!myResp ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                  <button
                    onClick={() => respond(bell.id, 'on_my_way')}
                    disabled={responding !== null}
                    style={{
                      padding: '14px 18px', background: G.green, color: G.bg,
                      border: 'none', borderRadius: 8,
                      fontFamily: G.sans, fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
                      textTransform: 'uppercase', cursor: 'pointer',
                      opacity: responding ? 0.7 : 1,
                    }}>I&apos;m on my way</button>
                  <button
                    onClick={() => respond(bell.id, 'in_thirty')}
                    disabled={responding !== null}
                    style={{
                      padding: '12px 18px', background: 'transparent', color: G.muted,
                      border: `1px solid ${G.hairline2}`, borderRadius: 8,
                      fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
                      textTransform: 'uppercase', cursor: 'pointer',
                      opacity: responding ? 0.7 : 1,
                    }}>Available in 30 min</button>
                  <button
                    onClick={() => respond(bell.id, 'cannot')}
                    disabled={responding !== null}
                    style={{
                      padding: '10px 18px', background: 'transparent', color: G.clay,
                      border: `1px solid ${G.clay}`, borderRadius: 8,
                      fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, cursor: 'pointer',
                      opacity: responding ? 0.7 : 1,
                    }}>Can&apos;t — pass to next circle</button>
                  {respondError && (
                    <div style={{
                      padding: '10px 12px', borderRadius: 8,
                      background: G.paper, border: `1px solid ${G.clay}`,
                      fontFamily: G.serif, fontStyle: 'italic', fontSize: 12,
                      color: G.clay, lineHeight: 1.5,
                    }}>{respondError}</div>
                  )}
                </div>
              ) : myResp === 'on_my_way' ? (
                <div style={{ marginTop: 14, padding: 14, background: G.paper, border: `1px solid ${G.green}`, borderRadius: 10, textAlign: 'center' }}>
                  <GLabel color={G.green}>Answered · on your way</GLabel>
                  <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 18, color: G.ink, marginTop: 8, lineHeight: 1.2 }}>
                    They&apos;ve been told.
                  </div>
                </div>
              ) : myResp === 'in_thirty' ? (
                <div style={{ marginTop: 14, padding: 14, background: G.paper, border: `1px solid ${G.hairline2}`, borderRadius: 10, textAlign: 'center' }}>
                  <GLabel>Offered · in 30 min</GLabel>
                  <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.ink2, marginTop: 8, lineHeight: 1.4 }}>
                    They were told. They&apos;ll keep ringing for sooner — but if nobody else can, you&apos;ll hear back.
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 14, padding: 14, background: 'transparent', border: `1px dashed ${G.hairline2}`, borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted, lineHeight: 1.4 }}>
                    Passed to the next circle. No guilt — that&apos;s how the {getCopy().urgentSignal.noun.toLowerCase()} works.
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div style={{
          margin: '28px 4px 8px', padding: '18px 16px',
          borderTop: `1px solid ${G.ink}`, borderBottom: `1px solid ${G.ink}`,
          textAlign: 'center',
        }}>
          <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 15, color: G.ink, lineHeight: 1.4 }}>
            &ldquo;The {getCopy().urgentSignal.noun.toLowerCase()} rings because someone trusts you.&rdquo;
          </div>
        </div>
      </div>
    </div>
  );
}

export function ScreenLantern({ initialCompose = false, role = 'keeper', onBack, onPost }: {
  initialCompose?: boolean;
  role?: 'keeper' | 'watcher';
  onBack?: () => void;
  onPost?: () => void;
}) {
  const { activeBell, refreshBell } = useAppData();
  // 'loading' while we check for an existing ringing bell
  const [mode, setMode] = useState<'loading' | 'compose' | 'ringing'>(
    initialCompose ? 'compose' : 'loading'
  );
  const [ringReason, setRingReason] = useState('');
  const [ringBellId, setRingBellId] = useState<string | undefined>();
  const [ringWarning, setRingWarning] = useState<string | undefined>();

  // When initialCompose flips true (user tapped "Ring" from another screen),
  // jump straight to compose without waiting for the active-bell check.
  // This replaces the old key={`lantern-${bellCompose}`} remount hack.
  useEffect(() => {
    if (initialCompose) setMode('compose');
  }, [initialCompose]);

  // On first render as a keep-alive screen (parent only): use shared activeBell
  // from context rather than a dedicated fetch — context is already polling.
  useEffect(() => {
    if (role !== 'keeper' || initialCompose) return;
    if (activeBell && activeBell.status === 'ringing') {
      setRingBellId(activeBell.id);
      setRingReason(activeBell.reason);
      setMode('ringing');
    } else {
      setMode('compose');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount — subsequent changes come through activeBell prop

  // Keep ringing state in sync if bell is cancelled/handled externally
  useEffect(() => {
    if (mode !== 'ringing') return;
    if (!activeBell || activeBell.status !== 'ringing') {
      setRingBellId(undefined);
      setRingReason('');
      setRingWarning(undefined);
      setMode('compose');
    }
  }, [activeBell, mode]);

  if (role === 'watcher') return <BellIncoming />;

  if (mode === 'loading') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BELL_BG }}>
        <div style={{ fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 13 }}>Checking {getCopy().urgentSignal.noun.toLowerCase()} status…</div>
      </div>
    );
  }

  const resetToCompose = () => { setRingBellId(undefined); setRingReason(''); setRingWarning(undefined); setMode('compose'); };

  return mode === 'compose'
    ? <BellCompose
        onRing={(bellId, label, warning) => { setRingBellId(bellId); setRingReason(label); setRingWarning(warning); setMode('ringing'); }}
        onBack={onBack}
        onPost={onPost}
      />
    : <BellRinging
        onBack={() => { resetToCompose(); onBack?.(); }}
        onDone={resetToCompose}
        bellId={ringBellId}
        reason={ringReason}
        warning={ringWarning}
      />;
}
