'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { G } from './tokens';
import { GMasthead, GLabel, Icons } from './shared';
import { useHousehold } from './HouseholdSwitcher';
import { shortName } from '@/lib/format';
import { WhenPickerWindow, WhenPickerDate, shiftWindowPresets, datePresets } from './WhenPicker';
import { getCopy } from '@/lib/copy';

type Kid = { id: string; name: string };
type Caregiver = { id: string; name: string; role: string };

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScreenPost({ onCancel, onPost, onRing }: {
  onCancel?: () => void;
  onPost?: (msg?: string) => void;
  onRing?: () => void;
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

  const [title, setTitle] = useState('');
  const [forWhom, setForWhom] = useState('');
  const [selectedKidIds, setSelectedKidIds] = useState<string[]>([]);
  const [kids, setKids] = useState<Kid[]>([]);
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [preferredCaregiverId, setPreferredCaregiverId] = useState<string>('');

  useEffect(() => {
    fetch('/api/village').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.kids) setKids(d.kids);
      if (d?.adults) setCaregivers((d.adults as Caregiver[]).filter(a => a.role === 'caregiver'));
    }).catch(() => {});
  }, [active?.id]);

  const toggleKid = (id: string) => {
    setSelectedKidIds(prev => prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]);
  };
  const [notes, setNotes] = useState('');
  const [startsAt, setStartsAt] = useState(defaults.start);
  const [endsAt, setEndsAt] = useState(defaults.end);

  // Minimum selectable datetime — updated every minute so it stays current.
  const [minNow, setMinNow] = useState(() => toLocalInputValue(new Date()));
  useEffect(() => {
    const tick = () => setMinNow(toLocalInputValue(new Date()));
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  const [isPaid, setIsPaid] = useState(false);
  const [rate, setRate] = useState('22');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurDays, setRecurDays] = useState<Set<number>>(new Set([1])); // 0=Sun…6=Sat
  const [recurEnds, setRecurEnds] = useState<'date' | 'count'>('count');
  const [recurEndDate, setRecurEndDate] = useState('');
  const [recurCount, setRecurCount] = useState('8');

  function toggleRecurDay(d: number) {
    setRecurDays(prev => {
      const next = new Set(prev);
      if (next.has(d)) { if (next.size > 1) next.delete(d); } else next.add(d);
      return next;
    });
  }
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    const now = new Date();
    const start = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    setTitle('');
    setForWhom('');
    setSelectedKidIds([]);
    setNotes('');
    setStartsAt(toLocalInputValue(start));
    setEndsAt(toLocalInputValue(end));
    setIsPaid(false);
    setRate('22');
    setIsRecurring(false);
    setRecurDays(new Set([1]));
    setRecurEnds('count');
    setRecurEndDate('');
    setRecurCount('8');
    setPreferredCaregiverId('');
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!title.trim()) return setError('Add a short title.');
    const s = new Date(startsAt);
    const e = new Date(endsAt);
    if (isNaN(+s) || isNaN(+e)) return setError('Pick a start and end time.');
    if (e <= s) return setError('End must be after start.');
    // Guard: recurring "end by date" with no date filled in
    if (isRecurring && recurEnds === 'date' && !recurEndDate.trim()) {
      return setError(`Pick an end date for your recurring ${getCopy().request.newLabel.replace(/^New /, '').toLowerCase()}.`);
    }
    setSubmitting(true);
    try {
      const rateCents = isPaid && rate.trim() ? Math.round(parseFloat(rate) * 100) : null;
      const kidNames = selectedKidIds
        .map(id => kids.find(k => k.id === id)?.name)
        .filter(Boolean)
        .join(' & ');
      const forWhomFinal = [kidNames, forWhom.trim()].filter(Boolean).join(' · ');
      const recurrence = isRecurring ? {
        daysOfWeek: Array.from(recurDays).sort(),
        endsBy: recurEnds === 'date' ? recurEndDate : undefined,
        occurrences: recurEnds === 'count' ? parseInt(recurCount) || undefined : undefined,
      } : undefined;
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
          recurrence,
          preferredCaregiverId: preferredCaregiverId || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      const data = await res.json();
      resetForm();
      const count = data.count ?? 1;
      onPost?.(count > 1 ? `${count} ${getCopy().request.tabLabel.toLowerCase()} posted` : `Posted to ${getCopy().circle.title}`);
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
        rightAction={onRing ? (
          <button
            onClick={onRing}
            aria-label={getCopy().urgentSignal.actionLabel}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 26,
              background: G.clay, border: 'none', cursor: 'pointer',
              padding: 0, color: G.bg,
              boxShadow: '0 1px 4px rgba(181,52,43,0.35)',
            }}
          >
            <svg width="14" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2v2" stroke={G.bg} strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M8 4h8" stroke={G.bg} strokeWidth="1.8" strokeLinecap="round"/>
              <rect x="7" y="6" width="10" height="13" rx="2" stroke={G.bg} strokeWidth="1.5"/>
              <path d="M7 10h10" stroke={G.bg} strokeWidth="1" strokeOpacity="0.5"/>
              <ellipse cx="12" cy="14" rx="2.5" ry="3" fill={G.bg} fillOpacity="0.9"/>
              <path d="M9 19h6" stroke={G.bg} strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        ) : undefined}
        title="Post a Need"
        tagline={`For a last-minute need, light the ${getCopy().urgentSignal.noun.toLowerCase()} instead.`}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 88px' }}>
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
            placeholder="Afternoon pickup, date night…"
            style={inputStyle}
          />
        </Field>

        <div style={{ marginTop: 14 }}>
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
                      color: on ? G.bg : G.ink,
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
              No children added yet. Add them on the {getCopy().circle.title} tab.
            </div>
          )}
          <input
            value={forWhom} onChange={e => setForWhom(e.target.value)}
            placeholder="Or note someone else (e.g. grandma)"
            style={{ ...inputStyle, marginTop: 10, fontSize: 16, fontFamily: G.serif, fontStyle: 'italic' }}
          />
        </div>

        {caregivers.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <GLabel>Notify</GLabel>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginTop: 3, marginBottom: 8 }}>
              Send to everyone, or pick one person.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button
                type="button"
                onClick={() => setPreferredCaregiverId('')}
                style={{
                  padding: '7px 12px', borderRadius: 100,
                  background: !preferredCaregiverId ? G.ink : 'transparent',
                  color: !preferredCaregiverId ? G.bg : G.ink,
                  border: `1px solid ${!preferredCaregiverId ? G.ink : G.hairline2}`,
                  fontFamily: G.sans, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >Everyone</button>
              {caregivers.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPreferredCaregiverId(c.id)}
                  style={{
                    padding: '7px 12px', borderRadius: 100,
                    background: preferredCaregiverId === c.id ? G.ink : 'transparent',
                    color: preferredCaregiverId === c.id ? G.bg : G.ink,
                    border: `1px solid ${preferredCaregiverId === c.id ? G.ink : G.hairline2}`,
                    fontFamily: G.sans, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >{shortName(c.name)}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <GLabel>When</GLabel>
          <div style={{ marginTop: 8 }}>
            <WhenPickerWindow
              startValue={startsAt}
              endValue={endsAt}
              onChange={(s, e) => { setStartsAt(s); setEndsAt(e); }}
              presets={shiftWindowPresets}
              minNow={minNow}
              noPresets
            />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox" checked={isRecurring}
              onChange={e => setIsRecurring(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: G.ink }}
            />
            <span style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 14, color: G.ink }}>
              This repeats weekly
            </span>
          </label>
          {isRecurring && (
            <div style={{ marginTop: 12, padding: '14px 14px 10px', borderRadius: 8, border: `1px solid ${G.hairline2}`, background: G.paper, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={microLabel}>Repeats on</div>
                <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                  {['Su','Mo','Tu','We','Th','Fr','Sa'].map((lbl, i) => {
                    const on = recurDays.has(i);
                    return (
                      <button key={i} type="button" onClick={() => toggleRecurDay(i)} style={{
                        width: 34, height: 34, borderRadius: 17, cursor: 'pointer',
                        background: on ? G.ink : 'transparent',
                        color: on ? G.bg : G.ink,
                        border: `1px solid ${on ? G.ink : G.hairline2}`,
                        fontFamily: G.sans, fontSize: 10, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{lbl}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div style={microLabel}>Ends after</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {(['count', 'date'] as const).map(opt => (
                    <button key={opt} type="button" onClick={() => setRecurEnds(opt)} style={{
                      padding: '5px 12px', borderRadius: 100, cursor: 'pointer',
                      background: recurEnds === opt ? G.ink : 'transparent',
                      color: recurEnds === opt ? G.bg : G.ink,
                      border: `1px solid ${recurEnds === opt ? G.ink : G.hairline2}`,
                      fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
                      textTransform: 'uppercase',
                    }}>{opt === 'count' ? 'N weeks' : 'A date'}</button>
                  ))}
                </div>
                {recurEnds === 'count' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <input
                      type="number" min="1" max="52" value={recurCount}
                      onChange={e => setRecurCount(e.target.value)}
                      style={{ ...selectStyle, width: 72 }}
                    />
                    <span style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted }}>occurrences</span>
                  </div>
                )}
                {recurEnds === 'date' && (
                  <div style={{ marginTop: 10 }}>
                    <WhenPickerDate
                      value={recurEndDate}
                      onChange={setRecurEndDate}
                      presets={datePresets}
                      minDate={new Date().toISOString().slice(0, 10)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <GLabel>What</GLabel>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Pickup, dinner, bedtime routine…"
            style={{
              marginTop: 8, padding: 12, borderRadius: 8, width: '100%', boxSizing: 'border-box',
              border: `1px solid ${G.hairline2}`, background: G.paper,
              fontFamily: G.serif, fontStyle: 'italic', fontSize: 14, color: G.ink, lineHeight: 1.5,
              minHeight: 64, resize: 'vertical', outline: 'none',
            }}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox" checked={isPaid}
              onChange={e => setIsPaid(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: G.ink }}
            />
            <span style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 14, color: G.ink }}>
              This is a paid {getCopy().request.newLabel.replace(/^New /, '').toLowerCase()}
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
            background: G.green, color: G.bg, border: 'none', borderRadius: 8,
            fontFamily: G.sans, fontSize: 12, fontWeight: 700, letterSpacing: 1.8,
            textTransform: 'uppercase', cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting ? 0.7 : 1,
          }}
        >{submitting ? 'Posting…' : `Post to ${getCopy().circle.title}`}</button>

        <div style={{
          marginTop: 14, textAlign: 'center',
          fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted,
        }}>
          Last-minute?{' '}
          <button onClick={onRing} style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            color: G.mustard, borderBottom: `1px solid ${G.mustard}`, paddingBottom: 1,
            fontFamily: G.serif, fontStyle: 'italic', fontSize: 12,
          }}>{getCopy().urgentSignal.actionLabel} instead →</button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  marginTop: 6, paddingBottom: 8, width: '100%', boxSizing: 'border-box',
  border: 'none', borderBottom: `1px solid ${G.ink}`,
  background: 'transparent', outline: 'none',
  fontFamily: G.display, fontSize: 22, fontWeight: 500, color: G.ink,
};

const pillInput: React.CSSProperties = {
  marginTop: 3, width: '100%', border: 'none', background: 'transparent',
  fontFamily: G.display, fontSize: 16, color: G.ink, fontWeight: 500, outline: 'none',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <GLabel>{label}</GLabel>
      {children}
    </div>
  );
}

const microLabel: React.CSSProperties = {
  fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase',
  color: G.muted, fontWeight: 700, marginBottom: 4,
};

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, boxSizing: 'border-box',
  border: `1px solid ${G.hairline2}`, background: G.bg,
  fontFamily: G.display, fontSize: 14, color: G.ink, outline: 'none',
};

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
