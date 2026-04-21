'use client';
import React, { useState } from 'react';
import { G, RED, RED_DARK, BELL_BG } from './tokens';
import { GMasthead, GLabel, GAvatar } from './shared';

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
    read:        { color: G.muted, mark: '·' },
    coming:      { color: G.green, mark: '→' },
    'no-answer': { color: G.clay,  mark: '×' },
    queued:      { color: G.muted, mark: '◦' },
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

function BellCompose({ onRing, onBack, onPost }: { onRing: () => void; onBack?: () => void; onPost?: () => void }) {
  const [why, setWhy] = useState(1);
  const reasons = [
    { id: 0, label: 'Sick kid',             desc: 'need someone home, now' },
    { id: 1, label: 'Last-minute conflict', desc: 'appointment, meeting, something came up' },
    { id: 2, label: 'Pickup mixup',         desc: "I can't get to school/daycare" },
    { id: 3, label: 'Emergency',            desc: "something's wrong — help" },
  ];

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
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <BellPill label="Start" value="Now · 2:14 PM" emphasized />
            <BellPill label="Until" value="6:00 PM" />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <GLabel>A short note <span style={{ color: G.muted, fontWeight: 500, letterSpacing: 0.5, textTransform: 'none' }}>· optional</span></GLabel>
          <div style={{
            marginTop: 8, padding: 12, borderRadius: 8,
            border: `1px solid ${G.hairline2}`, background: G.paper,
            fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.ink2, lineHeight: 1.4,
            minHeight: 60,
          }}>
            Theo&apos;s at 102°. I&apos;m stuck at work till 4. Just need someone with him.
          </div>
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

        <button onClick={onRing} style={{
          marginTop: 22, width: '100%', padding: '18px 14px',
          background: RED, color: '#FBF7F0', border: 'none', borderRadius: 8,
          fontFamily: G.sans, fontSize: 13, fontWeight: 700, letterSpacing: 1.8,
          textTransform: 'uppercase', cursor: 'pointer',
          boxShadow: `0 4px 0 ${RED_DARK}`,
        }}>Ring the Bell</button>

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

function BellRinging({ onBack }: { onBack?: () => void }) {
  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: BELL_BG, color: G.ink }}>
      <GMasthead
        leftAction={onBack ? (
          <button onClick={onBack} style={{ fontFamily: G.display, fontSize: 26, color: G.ink, lineHeight: 1, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>×</button>
        ) : undefined}
        left={onBack ? undefined : "Ringing · 2:14 elapsed"}
        right="Urgent"
        title="Kid's fever · need someone"
        titleColor={RED}
        tagline="Theo's at 102°. Sam's 40 minutes out. Widening the ring until someone can come."
        folioLeft="No. 142" folioRight="Urgent edition"
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 120px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 18px' }}>
          <BellGlyph size={72} />
        </div>

        <GLabel color={G.ink}>Who&apos;s Been Called</GLabel>
        <div style={{ marginTop: 10, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 14, top: 12, bottom: 12, width: 1, background: G.hairline2 }} />
          <Rung ring={1} label="Inner Circle" status="rung" time="2:14 ago"
            people={[
              { name: 'Ruth P.', state: 'read',   sub: 'read · no reply' },
              { name: 'Mae L.',  state: 'read',   sub: 'read · no reply' },
              { name: 'Sam P.',  state: 'coming', sub: '40 min away · on the way' },
            ]} />
          <Rung ring={2} label="Family + close friends" status="rung" time="1:12 ago"
            people={[
              { name: 'Omar K.', state: 'coming',    sub: '15 min · leaving now', highlight: true },
              { name: 'Jen R.',  state: 'read',      sub: 'read · at work' },
              { name: 'Dad',     state: 'no-answer', sub: 'no answer' },
            ]} />
          <Rung ring={3} label="Trusted sitters" status="queued" time="starts at 3:00"
            people={[
              { name: 'Priya S.', state: 'queued', sub: 'not yet rung' },
              { name: 'Ben T.',   state: 'queued', sub: 'not yet rung' },
            ]} />
          <Rung ring={4} label="Whole village" status="pending" time="final · if no one by 4:00" people={[]} />
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
          <button onClick={onBack} style={{
            flex: 1, padding: '14px 12px',
            background: 'transparent', color: G.ink,
            border: `1px solid ${G.ink}`, borderRadius: 8,
            fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.4,
            textTransform: 'uppercase', cursor: 'pointer',
          }}>Mark handled</button>
        </div>
      </div>
    </div>
  );
}

function BellIncoming() {
  const [answered, setAnswered] = useState<'yes' | 'later' | 'no' | null>(null);
  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: BELL_BG, color: G.ink }}>
      <GMasthead
        left="Incoming · now" right="Urgent"
        title="The Parks are ringing"
        titleColor={RED}
        tagline="Sarah rang the bell 14 seconds ago. Inner circle — you're first."
        folioLeft="No. 142" folioRight="Urgent edition"
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 120px' }}>
        <div style={{
          background: G.paper, border: `1px solid ${RED}`, borderRadius: 10,
          padding: 18, marginTop: 8, position: 'relative',
          boxShadow: '0 8px 24px rgba(181,52,43,0.12)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <GAvatar name="Sarah Park" size={44} />
            <div>
              <div style={{ fontFamily: G.display, fontSize: 18, fontWeight: 500, color: G.ink, lineHeight: 1.1 }}>Sarah Park</div>
              <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginTop: 2 }}>
                Nora &amp; Finn&apos;s mom · 12 min away
              </div>
            </div>
          </div>
          <GLabel color={RED}>What&apos;s happening</GLabel>
          <div style={{ fontFamily: G.display, fontSize: 20, fontWeight: 500, color: G.ink, marginTop: 6, lineHeight: 1.2 }}>
            Finn has a fever · need someone home
          </div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', color: G.ink2, fontSize: 13, marginTop: 6, lineHeight: 1.4 }}>
            &ldquo;He&apos;s at 101.5. Sam&apos;s 40 min out and I&apos;m in a deposition. Anyone close by?&rdquo;
          </div>
          <div style={{ height: 1, background: G.hairline, margin: '16px 0' }} />
          <div style={{ display: 'flex', gap: 20, fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted }}>
            <div><strong style={{ fontStyle: 'normal', color: G.ink }}>412 Oak St.</strong> · ~8 min from you</div>
          </div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginTop: 4 }}>
            Likely 2–3 hours until Sam is home.
          </div>
        </div>

        {!answered && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
            <button onClick={() => setAnswered('yes')} style={{
              padding: '14px 18px', background: RED, color: '#FFF',
              border: 'none', borderRadius: 8,
              fontFamily: G.sans, fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
              textTransform: 'uppercase', cursor: 'pointer',
              boxShadow: `0 4px 0 ${RED_DARK}`,
            }}>I&apos;m on my way</button>
            <button onClick={() => setAnswered('later')} style={{
              padding: '12px 18px', background: 'transparent', color: G.ink,
              border: `1px solid ${G.hairline2}`, borderRadius: 8,
              fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
              textTransform: 'uppercase', cursor: 'pointer',
            }}>Could in 30 min</button>
            <button onClick={() => setAnswered('no')} style={{
              padding: '10px 18px', background: 'transparent', color: G.muted, border: 'none',
              fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, cursor: 'pointer',
            }}>Can&apos;t — pass to next circle</button>
          </div>
        )}

        {answered === 'yes' && (
          <div style={{ marginTop: 18, padding: 18, background: G.paper, border: `1px solid ${G.green}`, borderRadius: 10, textAlign: 'center' }}>
            <GLabel color={G.green}>Answered · on your way</GLabel>
            <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 22, color: G.ink, marginTop: 8, lineHeight: 1.2 }}>
              Sarah&apos;s been told.
            </div>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.ink2, marginTop: 6 }}>
              Directions sent to your phone. Drive safe.
            </div>
          </div>
        )}
        {answered === 'later' && (
          <div style={{ marginTop: 18, padding: 18, background: G.paper, border: `1px solid ${G.hairline2}`, borderRadius: 10, textAlign: 'center' }}>
            <GLabel>Offered · in 30 min</GLabel>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.ink2, marginTop: 8, lineHeight: 1.4 }}>
              Sarah was told. She&apos;ll keep ringing others for sooner — but if nobody else can, you&apos;ll hear back.
            </div>
          </div>
        )}
        {answered === 'no' && (
          <div style={{ marginTop: 18, padding: 18, background: 'transparent', border: `1px dashed ${G.hairline2}`, borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted, lineHeight: 1.4 }}>
              Passed to the next circle. No guilt — that&apos;s how the bell works.
            </div>
          </div>
        )}

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
  if (role === 'caregiver') return <BellIncoming />;
  return mode === 'compose'
    ? <BellCompose onRing={() => setMode('ringing')} onBack={onBack} onPost={onPost} />
    : <BellRinging onBack={onBack} />;
}
