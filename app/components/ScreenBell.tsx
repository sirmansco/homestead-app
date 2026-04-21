'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { G, RED, RED_DARK, BELL_BG } from './tokens';
import { GMasthead, GLabel, GAvatar } from './shared';
import { requestPushPermission } from './PushRegistrar';

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
            {people.map((p, i) => <Person key={i} {...p} />)}
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

type VillageMember = { id: string; name: string; villageGroup: 'inner' | 'family' | 'sitter' };

function PushPermissionBanner() {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
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
              const ok = await requestPushPermission();
              setPermission(ok ? 'granted' : 'denied');
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
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to ring bell');
      const data = await res.json();
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
          <button onClick={onBack} style={{ fontFamily: G.display, fontSize: 26, color: G.ink, lineHeight: 1, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>×</button>
        }
        right="Ring the bell"
        title="Bell Tower"
        titleColor={RED}
        tagline="Something came up — we'll reach the inner circle first, the village if no one answers."
        folioLeft="No. 142" folioRight="Urgent edition"
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 120px' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <label style={{ display: 'block' }}>
              <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: RED, fontWeight: 700, marginBottom: 4 }}>Start</div>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={e => setStartsAt(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8, boxSizing: 'border-box',
                  border: `1px solid ${RED}`, background: '#FFE6DA',
                  fontFamily: G.display, fontSize: 13, color: G.ink, outline: 'none',
                }}
              />
            </label>
            <label style={{ display: 'block' }}>
              <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: G.muted, fontWeight: 700, marginBottom: 4 }}>Until</div>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={e => setEndsAt(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8, boxSizing: 'border-box',
                  border: `1px solid ${G.hairline2}`, background: G.paper,
                  fontFamily: G.display, fontSize: 13, color: G.ink, outline: 'none',
                }}
              />
            </label>
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
            <div><b style={{ fontFamily: G.sans, fontStyle: 'normal', fontSize: 11, fontWeight: 700, color: G.ink2, letterSpacing: 1 }}>+2 MIN</b> &nbsp; family & close friends</div>
            <div><b style={{ fontFamily: G.sans, fontStyle: 'normal', fontSize: 11, fontWeight: 700, color: G.ink2, letterSpacing: 1 }}>+5 MIN</b> &nbsp; trusted sitters</div>
            <div><b style={{ fontFamily: G.sans, fontStyle: 'normal', fontSize: 11, fontWeight: 700, color: G.ink2, letterSpacing: 1 }}>+10 MIN</b> &nbsp; the whole village</div>
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
        }}>{submitting ? 'Ringing…' : 'Ring the Bell'}</button>

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

function BellRinging({ onBack, bellId, reason }: { onBack?: () => void; bellId?: string; reason?: string }) {
  const [members, setMembers] = useState<VillageMember[] | null>(null);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    fetch('/api/village')
      .then(r => r.ok ? r.json() : { adults: [] })
      .then(d => setMembers((d.adults as VillageMember[]) || []))
      .catch(() => setMembers([]));
  }, []);

  const byGroup = (g: 'inner' | 'family' | 'sitter') =>
    (members || []).filter(m => m.villageGroup === g);

  const inner  = byGroup('inner');
  const family = byGroup('family');
  const sitter = byGroup('sitter');

  async function handleMarkDone() {
    if (!bellId || marking) return;
    setMarking(true);
    await fetch(`/api/bell/${bellId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'handled' }),
    }).catch(() => {});
    onBack?.();
  }

  async function handleCancel() {
    if (!confirm('Cancel the bell? Everyone who was notified will receive a cancellation message.')) return;
    if (bellId) {
      await fetch(`/api/bell/${bellId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      }).catch(() => {});
    }
    onBack?.();
  }

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: BELL_BG, color: G.ink }}>
      <GMasthead
        leftAction={onBack ? (
          <button onClick={onBack} style={{ fontFamily: G.display, fontSize: 26, color: G.ink, lineHeight: 1, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>×</button>
        ) : undefined}
        right="Urgent"
        title={reason || 'Bell ringing'}
        titleColor={RED}
        tagline="Your village is being notified — inner circle first, widening if no one answers."
        folioLeft="Live" folioRight="Urgent edition"
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 120px' }}>
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
                people={inner.map(m => ({ name: m.name, state: 'queued', sub: 'notified' }))} />
              <Rung ring={2} label="Family & close friends" status={family.length > 0 ? 'queued' : 'pending'} time="+2 min if no answer"
                people={family.map(m => ({ name: m.name, state: 'queued', sub: 'standing by' }))} />
              <Rung ring={3} label="Trusted sitters" status={sitter.length > 0 ? 'queued' : 'pending'} time="+5 min"
                people={sitter.map(m => ({ name: m.name, state: 'queued', sub: 'standing by' }))} />
              <Rung ring={4} label="Whole village" status="pending" time="+10 min · last resort" people={[]} />
            </div>
          </>
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
          <button onClick={handleCancel} style={{
            width: '100%', padding: '12px 12px',
            background: 'transparent', color: G.muted,
            border: `1px solid ${G.hairline2}`, borderRadius: 8,
            fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
            textTransform: 'uppercase', cursor: 'pointer',
          }}>Cancel bell · notify everyone</button>
        </div>
      </div>
    </div>
  );
}

function BellIncoming() {
  const [bells, setBells] = useState<ActiveBell[] | null>(null);
  const [responding, setResponding] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/bell/active');
      if (!res.ok) return;
      const data = await res.json();
      setBells(data.bells || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
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
          tagline="No bells ringing right now. You'll see alerts here when a family needs help."
          folioLeft="No alerts" folioRight="Standing by"
        />
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 120px' }}>
          <PushPermissionBanner />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
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
        folioLeft="Live" folioRight="Urgent edition"
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 120px' }}>
        {activeBells.map(bell => {
          const myResp = bell.myResponse;
          const rungAt = new Date(bell.createdAt);
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
                Needed from {new Date(bell.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} until {new Date(bell.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
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
                    }}>Could in 30 min</button>
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
  const [mode, setMode] = useState<'compose' | 'ringing'>(initialCompose ? 'compose' : 'ringing');
  const [ringReason, setRingReason] = useState('');
  const [ringBellId, setRingBellId] = useState<string | undefined>();

  if (role === 'caregiver') return <BellIncoming />;

  return mode === 'compose'
    ? <BellCompose
        onRing={(bellId, label) => { setRingBellId(bellId); setRingReason(label); setMode('ringing'); }}
        onBack={onBack}
        onPost={onPost}
      />
    : <BellRinging onBack={onBack} bellId={ringBellId} reason={ringReason} />;
}
