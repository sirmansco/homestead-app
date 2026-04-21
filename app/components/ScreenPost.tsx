'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { G } from './tokens';
import { GMasthead, GLabel } from './shared';
import { useHousehold } from './HouseholdSwitcher';

type Kid = { id: string; name: string };

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScreenPost({ onCancel, onPost }: {
  onCancel?: () => void;
  onPost?: (msg?: string) => void;
}) {
  const { active, all } = useHousehold();
  const multi = all.length > 1;

  const defaults = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    return { start: toLocalInputValue(start), end: toLocalInputValue(end) };
  }, []);

  const [title, setTitle] = useState('Evening sit');
  const [forWhom, setForWhom] = useState('');
  const [selectedKidIds, setSelectedKidIds] = useState<string[]>([]);
  const [kids, setKids] = useState<Kid[]>([]);

  useEffect(() => {
    fetch('/api/village').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.kids) setKids(d.kids);
    }).catch(() => {});
  }, [active?.id]);

  const toggleKid = (id: string) => {
    setSelectedKidIds(prev => prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]);
  };
  const [notes, setNotes] = useState('');
  const [startsAt, setStartsAt] = useState(defaults.start);
  const [endsAt, setEndsAt] = useState(defaults.end);
  const [isPaid, setIsPaid] = useState(false);
  const [rate, setRate] = useState('22');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!title.trim()) return setError('Add a short title.');
    const s = new Date(startsAt);
    const e = new Date(endsAt);
    if (isNaN(+s) || isNaN(+e)) return setError('Pick a start and end time.');
    if (e <= s) return setError('End must be after start.');
    setSubmitting(true);
    try {
      const rateCents = isPaid && rate.trim() ? Math.round(parseFloat(rate) * 100) : null;
      const kidNames = selectedKidIds
        .map(id => kids.find(k => k.id === id)?.name)
        .filter(Boolean)
        .join(' & ');
      const forWhomFinal = [kidNames, forWhom.trim()].filter(Boolean).join(' · ');
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          forWhom: forWhomFinal || undefined,
          notes: notes.trim() || undefined,
          startsAt: s.toISOString(),
          endsAt: e.toISOString(),
          rateCents: Number.isFinite(rateCents as number) ? rateCents : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      onPost?.('Posted to the Village');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: G.bg, color: G.ink }}>
      <GMasthead
        leftAction={
          <button onClick={onCancel} style={{
            fontFamily: G.display, fontSize: 26, color: G.ink, lineHeight: 1,
            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
          }}>×</button>
        }
        title="Post a Need"
        tagline="For a last-minute need, ring the bell instead."
        folioRight="Homestead Press"
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 120px' }}>
        {multi && active && (
          <div style={{
            marginTop: 4, padding: '10px 12px',
            background: G.paper, border: `1px solid ${G.hairline2}`,
            borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>{active.glyph}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: G.muted, fontWeight: 700 }}>
                Posting to
              </div>
              <div style={{ fontFamily: G.display, fontSize: 14, color: G.ink, fontWeight: 500 }}>
                {active.name}
              </div>
            </div>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 11, color: G.muted }}>
              switch in masthead
            </div>
          </div>
        )}

        <Field label="Title">
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Evening sit"
            style={inputStyle}
          />
        </Field>

        <div style={{ marginTop: 22 }}>
          <GLabel>For</GLabel>
          {kids.length > 0 ? (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {kids.map(k => {
                const on = selectedKidIds.includes(k.id);
                return (
                  <button
                    key={k.id} type="button"
                    onClick={() => toggleKid(k.id)}
                    style={{
                      padding: '7px 12px', borderRadius: 100,
                      background: on ? G.ink : 'transparent',
                      color: on ? '#FBF7F0' : G.ink,
                      border: `1px solid ${on ? G.ink : G.hairline2}`,
                      fontFamily: G.sans, fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
                      cursor: 'pointer',
                    }}
                  >{k.name}</button>
                );
              })}
            </div>
          ) : (
            <div style={{
              marginTop: 8, padding: '10px 12px',
              background: G.paper, border: `1px dashed ${G.hairline2}`, borderRadius: 8,
              fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted,
            }}>
              No children added yet. Add them on the Village tab.
            </div>
          )}
          <input
            value={forWhom} onChange={e => setForWhom(e.target.value)}
            placeholder="Or note someone else (e.g. grandma)"
            style={{ ...inputStyle, marginTop: 10, fontSize: 14, fontFamily: G.serif, fontStyle: 'italic' }}
          />
        </div>

        <div style={{ marginTop: 22 }}>
          <GLabel>When</GLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <Pill label="Starts">
              <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} style={pillInput} />
            </Pill>
            <Pill label="Ends">
              <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} style={pillInput} />
            </Pill>
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <GLabel>What</GLabel>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Pickup, dinner, bedtime routine…"
            style={{
              marginTop: 8, padding: 14, borderRadius: 8, width: '100%',
              border: `1px solid ${G.hairline2}`, background: G.paper,
              fontFamily: G.serif, fontStyle: 'italic', fontSize: 14, color: G.ink, lineHeight: 1.5,
              minHeight: 88, resize: 'vertical', outline: 'none',
            }}
          />
        </div>

        <div style={{ marginTop: 22 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox" checked={isPaid}
              onChange={e => setIsPaid(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: G.ink }}
            />
            <span style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 14, color: G.ink }}>
              This is a paid shift
            </span>
          </label>
          {isPaid && (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Pill label="Rate ($/hr)">
                <input
                  type="number" inputMode="decimal" min="0" step="0.5"
                  value={rate} onChange={e => setRate(e.target.value)}
                  style={pillInput}
                />
              </Pill>
              <Pill label="Extras">
                <input placeholder="optional" style={pillInput} />
              </Pill>
            </div>
          )}
        </div>

        {error && (
          <div style={{
            marginTop: 14, padding: '10px 12px', borderRadius: 8,
            background: '#FFE6DA', color: '#7A2F12',
            fontFamily: G.serif, fontStyle: 'italic', fontSize: 13,
          }}>{error}</div>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          style={{
            marginTop: 24, width: '100%', padding: '16px 14px',
            background: G.ink, color: '#FBF7F0', border: 'none', borderRadius: 8,
            fontFamily: G.sans, fontSize: 12, fontWeight: 700, letterSpacing: 1.8,
            textTransform: 'uppercase', cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting ? 0.7 : 1,
          }}
        >{submitting ? 'Posting…' : 'Post to the Village'}</button>

        <div style={{
          marginTop: 14, textAlign: 'center',
          fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted,
        }}>
          Last-minute?{' '}
          <span style={{ color: G.clay, borderBottom: `1px solid ${G.clay}`, paddingBottom: 1 }}>
            Ring the bell instead →
          </span>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  marginTop: 6, paddingBottom: 8, width: '100%',
  border: 'none', borderBottom: `1px solid ${G.ink}`,
  background: 'transparent', outline: 'none',
  fontFamily: G.display, fontSize: 22, fontWeight: 500, color: G.ink,
};

const pillInput: React.CSSProperties = {
  marginTop: 3, width: '100%', border: 'none', background: 'transparent',
  fontFamily: G.display, fontSize: 14, color: G.ink, fontWeight: 500, outline: 'none',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <GLabel>{label}</GLabel>
      {children}
    </div>
  );
}

function Pill({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      border: `1px solid ${G.hairline2}`, background: G.paper,
    }}>
      <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: G.muted, fontWeight: 700 }}>{label}</div>
      {children}
    </div>
  );
}
