'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { G, RED, RED_DARK, BELL_BG } from './tokens';
import { GMasthead, GLabel, GAvatar } from './shared';
import { requestPushPermission } from './PushRegistrar';
import { shortName } from '@/lib/format';
import { fmtTimeOnly } from '@/lib/format/time';
import { WhenPickerWindow, bellWindowPresets } from './WhenPicker';

function BellPill({ label, value, emphasized }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      border: `1px solid ${emphasized ? RED : G.hairline2}`,
      background: emphasized ? '#FFE6DA' : G.paper,
    }}>
      <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: emphasized ? RED : G.muted, fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: G.display, fontSize: 14, marginTop: 3, fontWeight: 500, color: emphasized ? RED : G.ink }}>{value}</div>
    </div>
  );
}

function BellGlyph({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size * (100 / 84)} viewBox="0 0 84 100">
      <g stroke={RED} strokeWidth="1" fill="none" opacity="0.35">
        <path d="M 8 50 Q 2 58 8 66" />
        <path d="M 76 50 Q 82 58 76 66" />
        <path d="M 2 46 Q -6 58 2 70" />
        <path d="M 82 46 Q 90 58 82 70" />
      </g>
      <path d="M 42 14 L 42 20 M 26 72 Q 26 38 42 22 Q 58 38 58 72 Z"
        fill={RED} stroke={RED_DARK} strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="22" y1="72" x2="62" y2="72" stroke={RED_DARK} strokeWidth="2" />
      <circle cx="42" cy="78" r="4" fill={RED_DARK} />
      <circle cx="42" cy="14" r="3" fill={RED_DARK} />
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
    rung:    { bg: RED,     ink: '#FBF7F0', label: 'Ringing' },
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

type VillageMember = { id: string; name: string; villageGroup: 'inner_circle' | 'sitter' };

function PushPermissionBanner() {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    if (typeof Notification !== 'undefined') setPermission(Notification.permission);
  }, []);

  if (permission === 'granted' || permission === null) return null;

  return (
    <div style={{
      margin: '12px 0', padding: '12px 14px', borderRadius: 8,
      background: permission === 'denied' ? G.paper : '#FFF8EC',
      border: `1px solid ${permission === 'denied' ? G.hairline2 : '#D4A017'}`,
    }}>
      {permission === 'denied' ? (
        <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, lineHeight: 1.5 }}>
          Notifications blocked. Enable them in your browser settings so caregivers get alerted when you ring.
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.ink2, lineHeight: 1.4, flex: 1 }}>
            Allow notifications so caregivers are alerted instantly.
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
              background: G.ink, color: '#FBF7F0', border: 'none',
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
  onRing: (bellId: string, label: string) => void;
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
    { id: 2, label: 'Pickup mixup',         desc: "I can't get to school/daycare" },
    { id: 3, label: 'Emergency',            desc: "something's wrong — help" },
    { id: 4, label: 'Other',               desc: 'something else came up' },
  ];

  async function handleRing() {
    if (why === null || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/bell', {
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
      if (!res.ok) throw new Error(data.error || 'Failed to ring bell');
      onRing(data.bell.id, reasons[why].label);
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
        right="Ring the bell"
        title="Bell Tower"
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
          border: `1px dashed ${RED}`, background: '#FFF0E8',
        }}>
          <GLabel color={RED}>How it&apos;ll ring</GLabel>
          <div style={{ marginTop: 8, fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.ink2, lineHeight: 1.6 }}>
            <div><b style={{ fontFamily: G.sans, fontStyle: 'normal', fontSize: 11, fontWeight: 700, color: RED, letterSpacing: 1 }}>NOW</b> &nbsp; inner circle</div>
            <div><b style={{ fontFamily: G.sans, fontStyle: 'normal', fontSize: 11, fontWeight: 700, color: G.ink2, letterSpacing: 1 }}>+5 MIN</b> &nbsp; sitters</div>
          </div>
        </div>

        <PushPermissionBanner />

        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#FFE6DA', border: `1px solid ${RED}`, fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: RED }}>
            {error}
          </div>
        )}

        <button onClick={handleRing} disabled={why === null || submitting} style={{
          marginTop: 22, width: '100%', padding: '18px 14px',
          background: why === null || submitting ? G.hairline2 : RED,
          color: why === null || submitting ? G.muted : '#FBF7F0',
          border: 'none', borderRadius: 8,
          fontFamily: G.sans, fontSize: 13, fontWeight: 700, letterSpacing: 1.8,
          textTransform: 'uppercase', cursor: why === null || submitting ? 'default' : 'pointer',
          boxShadow: why === null || submitting ? 'none' : `0 4px 0 ${RED_DARK}`,
          transition: 'background 0.15s, color 0.15s',
        }}>{submitting ? 'Ringing…' : why === null ? 'Select a reason above' : 'Ring the Bell'}</button>

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

type ActiveBell = {
  id: string;
  reason: string;
  note: string | null;
  startsAt: string;
  endsAt: string;
  status: 'ringing' | 'handled' | 'cancelled';
  createdAt: string;
  responses: { userId: string; response: string }[];
  myResponse: string | null;
};

type BellResponse = { userId: string; response: string };

function BellRinging({ onBack, onDone, bellId, reason }: { onBack?: () => void; onDone?: () => void; bellId?: string; reason?: string }) {
  const [members, setMembers] = useState<VillageMember[] | null>(null);
  const [responses, setResponses] = useState<BellResponse[]>([]);
  const [marking, setMarking] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [bellError, setBellError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/village')
      .then(r => r.ok ? r.json() : { adults: [] })
      .then(d => setMembers((d.adults as VillageMember[]) || []))
      .catch(() => setMembers([]));
  }, []);

  // Poll for real caregiver responses so parent sees who said "on my way"
  useEffect(() => {
    if (!bellId) return;
    const poll = () => {
      fetch('/api/bell/active')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data?.bells) return;
          const bell = data.bells.find((b: { id: string; responses: BellResponse[] }) => b.id === bellId);
          if (bell) setResponses(bell.responses || []);
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, [bellId]);

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

  const byGroup = (g: 'inner_circle' | 'sitter') =>
    (members || []).filter(m => m.villageGroup === g);

  const inner  = byGroup('inner_circle');
  const sitter = byGroup('sitter');

  async function handleMarkDone() {
    if (!bellId || marking) return;
    setMarking(true);
    setBellError(null);
    try {
      const res = await fetch(`/api/bell/${bellId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'handled' }),
      });
      if (!res.ok) throw new Error('Could not mark as handled');
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
        const res = await fetch(`/api/bell/${bellId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled' }),
        });
        if (!res.ok) throw new Error('Could not cancel bell');
        onDone?.();   // go to compose, stay on Bell tab
      } catch {
        setBellError('Could not cancel the bell. Try again.');
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
        title={reason || 'Bell ringing'}
        titleColor={RED}
        tagline="Your village is being notified — inner circle first, widening if no one answers."
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 100px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 18px' }}>
          <BellGlyph size={72} />
        </div>

        {members === null ? (
          <div style={{ textAlign: 'center', padding: '20px 0', fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 13 }}>
            Loading your village…
          </div>
        ) : members.length === 0 ? (
          <div style={{
            padding: '18px 16px', borderRadius: 8, border: `1px dashed ${RED}`,
            background: '#FFF0E8', marginTop: 8,
            fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.ink2, lineHeight: 1.5,
          }}>
            No one in your village yet. Add caregivers from the Village tab so they can receive bell alerts.
          </div>
        ) : (
          <>
            <GLabel color={G.ink}>Who&apos;s Being Called</GLabel>
            <div style={{ marginTop: 10, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 14, top: 12, bottom: 12, width: 1, background: G.hairline2 }} />
              <Rung ring={1} label="Inner Circle" status={inner.length > 0 ? 'rung' : 'pending'} time="Now"
                people={inner.map(m => ({ name: shortName(m.name), state: memberState(m.id), sub: memberSub(m.id), highlight: memberState(m.id) === 'coming' }))} />
              <Rung ring={2} label="Trusted sitters" status={sitter.length > 0 ? 'queued' : 'pending'} time="+5 min if no answer"
                people={sitter.map(m => ({ name: shortName(m.name), state: memberState(m.id), sub: memberSub(m.id), highlight: memberState(m.id) === 'coming' }))} />
            </div>
          </>
        )}

        {bellError && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 8,
            background: '#FFE6DA', border: `1px solid ${RED}`,
            fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: RED,
          }}>{bellError}</div>
        )}
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={handleMarkDone} disabled={marking} style={{
            width: '100%', padding: '14px 12px',
            background: G.ink, color: '#FBF7F0',
            border: 'none', borderRadius: 8,
            fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.4,
            textTransform: 'uppercase', cursor: marking ? 'wait' : 'pointer',
            opacity: marking ? 0.6 : 1,
          }}>Someone is on the way · Mark handled</button>
          {confirmingCancel ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCancel} style={{
                flex: 1, padding: '12px 12px',
                background: RED, color: '#FBF7F0', border: 'none', borderRadius: 8,
                fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
                textTransform: 'uppercase', cursor: 'pointer',
              }}>Yes, cancel bell</button>
              <button onClick={() => setConfirmingCancel(false)} style={{
                flex: 1, padding: '12px 12px',
                background: 'transparent', color: G.ink, border: `1px solid ${G.hairline2}`, borderRadius: 8,
                fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
                textTransform: 'uppercase', cursor: 'pointer',
              }}>Keep ringing</button>
            </div>
          ) : (
            <button onClick={handleCancel} style={{
              width: '100%', padding: '12px 12px',
              background: 'transparent', color: G.muted,
              border: `1px solid ${G.hairline2}`, borderRadius: 8,
              fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
              textTransform: 'uppercase', cursor: 'pointer',
            }}>Cancel bell · notify everyone</button>
          )}
        </div>
      </div>
    </div>
  );
}

function BellIncoming() {
  const [bells, setBells] = useState<ActiveBell[] | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/bell/active');
      if (!res.ok) {
        setPollError("Can't reach Homestead. Bells will appear once you're back online.");
        return;
      }
      const data = await res.json();
      setBells(data.bells || []);
      setPollError(null);
    } catch {
      setPollError("Can't reach Homestead. Bells will appear once you're back online.");
    }
  }, []);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    load();
    const interval = setInterval(load, 8_000);
    // Re-poll immediately when the tab regains focus (user comes back from another app)
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [load]);

  async function respond(bellId: string, response: 'on_my_way' | 'in_thirty' | 'cannot') {
    setResponding(bellId + response);
    await fetch(`/api/bell/${bellId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    }).catch(() => {});
    await load();
    setResponding(null);
  }

  const activeBells = (bells || []).filter(b => b.status === 'ringing');

  if (bells === null) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BELL_BG }}>
        <div style={{ fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 13 }}>Checking for bells…</div>
      </div>
    );
  }

  if (activeBells.length === 0) {
    return (
      <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: BELL_BG, color: G.ink }}>
        <GMasthead
          left="Bell" right="Incoming"
          title="All clear"
          titleColor={G.ink}
          tagline="You'll be notified instantly when a family needs help. Stand by."
        />
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 100px' }}>
          <PushPermissionBanner />
          {pollError && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 8,
              background: '#FFE6DA', border: `1px solid ${RED}`,
              fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: RED,
            }}>{pollError}</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.ink2, textAlign: 'center', lineHeight: 1.5, marginBottom: 16 }}>The bell is how families in your village ask for urgent help.</div>
            <BellGlyph size={48} />
            <div style={{ marginTop: 16, fontFamily: G.serif, fontStyle: 'italic', fontSize: 14, color: G.muted, lineHeight: 1.6, textAlign: 'center' }}>
              When someone rings the bell,<br />it will appear here.
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
        title={activeBells.length === 1 ? activeBells[0].reason : `${activeBells.length} bells ringing`}
        titleColor={RED}
        tagline="Someone in your village needs help. Inner circle — you're first."
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 100px' }}>
        {pollError && (
          <div style={{
            marginTop: 8, padding: '10px 14px', borderRadius: 8,
            background: '#FFE6DA', border: `1px solid ${RED}`,
            fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: RED,
          }}>{pollError}</div>
        )}
        {activeBells.map(bell => {
          const myResp = bell.myResponse;
          const rungAt = new Date(bell.createdAt);
          // eslint-disable-next-line react-hooks/purity
          const secondsAgo = Math.floor((Date.now() - rungAt.getTime()) / 1000);
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
                Needed from {fmtTimeOnly(bell.startsAt)} until {fmtTimeOnly(bell.endsAt)}
              </div>

              {!myResp ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                  <button
                    onClick={() => respond(bell.id, 'on_my_way')}
                    disabled={responding !== null}
                    style={{
                      padding: '14px 18px', background: RED, color: '#FFF',
                      border: 'none', borderRadius: 8,
                      fontFamily: G.sans, fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
                      textTransform: 'uppercase', cursor: 'pointer',
                      boxShadow: `0 4px 0 ${RED_DARK}`,
                      opacity: responding ? 0.7 : 1,
                    }}>I&apos;m on my way</button>
                  <button
                    onClick={() => respond(bell.id, 'in_thirty')}
                    disabled={responding !== null}
                    style={{
                      padding: '12px 18px', background: 'transparent', color: G.ink,
                      border: `1px solid ${G.hairline2}`, borderRadius: 8,
                      fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
                      textTransform: 'uppercase', cursor: 'pointer',
                      opacity: responding ? 0.7 : 1,
                    }}>Available in 30 min</button>
                  <button
                    onClick={() => respond(bell.id, 'cannot')}
                    disabled={responding !== null}
                    style={{
                      padding: '10px 18px', background: 'transparent', color: G.muted, border: 'none',
                      fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, cursor: 'pointer',
                      opacity: responding ? 0.7 : 1,
                    }}>Can&apos;t — pass to next circle</button>
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
                    Passed to the next circle. No guilt — that&apos;s how the bell works.
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
            &ldquo;The bell rings because someone trusts you.&rdquo;
          </div>
        </div>
      </div>
    </div>
  );
}

export function ScreenBell({ initialCompose = false, role = 'parent', onBack, onPost }: {
  initialCompose?: boolean;
  role?: 'parent' | 'caregiver';
  onBack?: () => void;
  onPost?: () => void;
}) {
  // 'loading' while we check for an existing ringing bell
  const [mode, setMode] = useState<'loading' | 'compose' | 'ringing'>(
    initialCompose ? 'compose' : 'loading'
  );
  const [ringReason, setRingReason] = useState('');
  const [ringBellId, setRingBellId] = useState<string | undefined>();

  // On mount (parent only): check if there's already a ringing bell to resume
  useEffect(() => {
    if (role !== 'parent' || initialCompose) return;
    fetch('/api/bell/active')
      .then(r => r.ok ? r.json() : { bells: [] })
      .then(data => {
        const active = (data.bells || []).find((b: { status: string; id: string; reason: string }) => b.status === 'ringing');
        if (active) {
          setRingBellId(active.id);
          setRingReason(active.reason);
          setMode('ringing');
        } else {
          setMode('compose');
        }
      })
      .catch(() => setMode('compose'));
  }, [role, initialCompose]);

  if (role === 'caregiver') return <BellIncoming />;

  if (mode === 'loading') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BELL_BG }}>
        <div style={{ fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 13 }}>Checking bell status…</div>
      </div>
    );
  }

  const resetToCompose = () => { setRingBellId(undefined); setRingReason(''); setMode('compose'); };

  return mode === 'compose'
    ? <BellCompose
        onRing={(bellId, label) => { setRingBellId(bellId); setRingReason(label); setMode('ringing'); }}
        onBack={onBack}
        onPost={onPost}
      />
    : <BellRinging
        onBack={() => { resetToCompose(); onBack?.(); }}  // ‹ Back exits Bell tab
        onDone={resetToCompose}                           // mark-done / cancel stays on Bell
        bellId={ringBellId}
        reason={ringReason}
      />;
}
