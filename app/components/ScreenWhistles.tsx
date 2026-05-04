'use client';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ERROR_BG, ERROR_TEXT, G } from './tokens';
import { GMasthead } from './shared';
import { HouseholdSwitcher } from './HouseholdSwitcher';
import { useAppData, type ShiftRow } from '@/app/context/AppDataContext';
import { fmtTimeRange, durationH, fmtDateShort, fmtMonthAbbr, fmtDayOfWeek, fmtDayOfWeekLong, localDateKey } from '@/lib/format/time';
import { getCopy } from '@/lib/copy';


function fmtWhen(startIso: string) {
  const s = new Date(startIso);
  const now = new Date();
  const shiftKey = localDateKey(s);
  const todayKey = localDateKey(now);
  const tomorrowKey = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const in7Key = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  if (shiftKey === todayKey) return 'Tonight';
  if (shiftKey === tomorrowKey) return 'Tomorrow';
  if (shiftKey < in7Key) return fmtDayOfWeekLong(s);
  return fmtDateShort(s);
}

function groupByDate(rows: ShiftRow[]): { key: string; label: string; rows: ShiftRow[] }[] {
  const groups: Map<string, { label: string; rows: ShiftRow[] }> = new Map();
  for (const row of rows) {
    const key = row.shift.startsAt.slice(0, 10);
    if (!groups.has(key)) groups.set(key, { label: fmtWhen(row.shift.startsAt), rows: [] });
    groups.get(key)!.rows.push(row);
  }
  return Array.from(groups.entries()).map(([key, { label, rows }]) => ({ key, label, rows }));
}

function dollars(cents: number | null) {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}/hr`;
}

function ReleaseForm({ onConfirm, onCancel, busy }: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [reason, setReason] = React.useState('');
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginBottom: 6 }}>
        Why can&apos;t you make it? The parent will be notified.
      </div>
      <textarea
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="e.g. Something came up at work…"
        rows={2}
        style={{
          width: '100%', padding: '8px 10px', marginBottom: 8,
          background: G.bg, border: `1px solid ${G.hairline2}`, borderRadius: 8,
          fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.ink,
          resize: 'none', outline: 'none', boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{
          padding: '7px 12px', background: 'transparent', color: G.muted,
          border: `1px solid ${G.hairline2}`, borderRadius: 100,
          fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
          textTransform: 'uppercase', cursor: 'pointer',
        }}>Keep</button>
        <button onClick={() => onConfirm(reason)} disabled={busy} style={{
          padding: '7px 12px', background: G.ink, color: G.bg,
          border: 'none', borderRadius: 100,
          fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
          textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.7 : 1,
        }}>{busy ? 'Releasing…' : 'Yes, release'}</button>
      </div>
    </div>
  );
}

function ShiftCard({ row, onClaim, onUnclaim, first, busy, mine, releasingUnclaim, onCancelUnclaim, animating, isHighlighted = false }: {
  row: ShiftRow;
  onClaim: (id: string) => void;
  onUnclaim?: (id: string, reason: string) => void;
  first?: boolean;
  busy?: boolean;
  mine?: boolean;
  releasingUnclaim?: boolean;
  onCancelUnclaim?: () => void;
  animating?: boolean;
  // B7: deep-link from push notification (B8 confirmation push lands here for
  // the watcher who just claimed). Card scrolls into view + amber ring for ~5s.
  isHighlighted?: boolean;
}) {
  const s = new Date(row.shift.startsAt);
  const month = fmtMonthAbbr(s);
  const dayLarge = String(s.getDate());
  const dow = fmtDayOfWeek(s);
  const cardRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted]);

  return (
    <article
      ref={cardRef as React.RefObject<HTMLElement>}
      data-whistle-id={row.shift.id}
      style={{
        paddingTop: first ? 4 : 12, paddingBottom: 12,
        borderBottom: `1px solid ${G.hairline}`,
        background: isHighlighted ? 'rgba(204,143,80,0.08)' : undefined,
        boxShadow: isHighlighted ? `inset 0 0 0 2px ${G.clay}` : undefined,
        transition: 'opacity 0.25s ease, transform 0.25s ease, background 200ms ease, box-shadow 200ms ease',
        opacity: animating ? 0 : 1,
        transform: animating ? 'translateY(12px)' : 'translateY(0)',
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{
          width: 46, flexShrink: 0,
          border: `1px solid ${G.ink}`, borderRadius: 6, overflow: 'hidden',
          textAlign: 'center', background: G.paper,
        }}>
          <div style={{ background: G.ink, color: G.bg, fontFamily: G.sans, fontSize: 8, fontWeight: 700, letterSpacing: 1.2, padding: '2px 0' }}>{month}</div>
          <div style={{ fontFamily: G.display, fontSize: 20, fontWeight: 500, color: G.ink, padding: '2px 0 0', lineHeight: 1 }}>{dayLarge}</div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 9, color: G.muted, paddingBottom: 3 }}>{dow}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
            <div style={{ fontFamily: G.display, fontSize: 16, fontWeight: 500, color: G.ink, lineHeight: 1.2 }}>{row.shift.title}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
              {dollars(row.shift.rateCents) && (
                <span style={{ fontFamily: G.display, fontSize: 13, color: G.ink }}>{dollars(row.shift.rateCents)}</span>
              )}
              {dollars(row.shift.rateCents) && <span style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 11, color: G.muted }}>·</span>}
              <span style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 11, color: G.muted }}>{durationH(row.shift.startsAt, row.shift.endsAt)}</span>
            </div>
          </div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 11, color: G.ink2, marginTop: 1 }}>
            {fmtWhen(row.shift.startsAt)} · {fmtTimeRange(row.shift.startsAt, row.shift.endsAt)}
            {row.household && <> · <span style={{ fontStyle: 'normal', color: G.muted }}>{row.household.glyph} {row.household.name}</span></>}
          </div>
          {(row.shift.forWhom || row.shift.notes) && (
            <div style={{ fontSize: 11, color: G.ink2, marginTop: 3, lineHeight: 1.4 }}>
              {row.shift.forWhom && <>For {row.shift.forWhom}</>}
              {row.shift.forWhom && row.shift.notes && ' · '}
              {row.shift.notes}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            {mine && onUnclaim ? (
              releasingUnclaim ? (
                <ReleaseForm
                  onConfirm={(reason) => onUnclaim(row.shift.id, reason)}
                  onCancel={onCancelUnclaim!}
                  busy={!!busy}
                />
              ) : (
                <button
                  onClick={() => onUnclaim(row.shift.id, '')}
                  disabled={busy}
                  style={{
                    padding: '5px 12px',
                    background: 'transparent', color: G.ink,
                    border: `1px solid ${G.hairline2}`, borderRadius: 100,
                    fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.4,
                    textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer',
                    opacity: busy ? 0.7 : 1,
                  }}>{busy ? 'Releasing…' : 'Release'}</button>
              )
            ) : (
              <button
                onClick={() => onClaim(row.shift.id)}
                disabled={busy}
                style={{
                  padding: '5px 12px',
                  background: G.ink, color: G.bg,
                  border: 'none', borderRadius: 100,
                  fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.4,
                  textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                }}>{busy ? 'Covering…' : getCopy().request.acceptVerb}</button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 6px' }}>
      <div style={{ width: 18, height: 1, background: G.ink }} />
      <div style={{
        fontFamily: G.sans, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase',
        color: G.ink, fontWeight: 700, whiteSpace: 'nowrap',
      }}>{label}</div>
      <div style={{ flex: 1, height: 1, background: G.hairline }} />
    </div>
  );
}

function SegmentControl({ value, onChange }: { value: 'open' | 'all'; onChange: (v: 'open' | 'all') => void }) {
  const options: { key: 'open' | 'all'; label: string }[] = [
    { key: 'open', label: 'Open' },
    { key: 'all', label: 'All' },
  ];
  return (
    <div style={{
      display: 'flex', gap: 0, margin: '10px 24px 2px',
      border: `1px solid ${G.hairline2}`, borderRadius: 100, overflow: 'hidden',
      background: G.paper,
    }}>
      {options.map(opt => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          style={{
            flex: 1, padding: '7px 0',
            background: value === opt.key ? G.ink : 'transparent',
            color: value === opt.key ? G.bg : G.muted,
            border: 'none', cursor: 'pointer',
            fontFamily: G.sans, fontSize: 9, fontWeight: 700,
            letterSpacing: 1.2, textTransform: 'uppercase',
            transition: 'background 0.15s ease, color 0.15s ease',
          }}
        >{opt.label}</button>
      ))}
    </div>
  );
}

export function ScreenWhistles({ onViewLantern, highlightWhistleId = null }: { onViewLantern?: () => void; highlightWhistleId?: string | null }) {
  const { activeBell, whistles: contextShifts, whistlesLoading, refreshWhistles, refreshBell } = useAppData();
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  // IDs currently mid-animation (fading out of one section before re-fetch settles)
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());

  // Fetch both scopes on mount
  useEffect(() => {
    refreshWhistles('village');
    refreshWhistles('mine');
  }, [refreshWhistles]);

  const now = new Date();

  const villageRows: ShiftRow[] = contextShifts['village'] ?? [];
  const mineRows: ShiftRow[] = contextShifts['mine'] ?? [];

  // Open = village scope, status open, future, not already claimed by me
  const openRows = villageRows.filter(r =>
    r.shift.status === 'open' &&
    new Date(r.shift.endsAt) >= now &&
    !r.claimedByMe
  );

  // My Whistles = mine scope, claimed by me, future
  const myRows = mineRows.filter(r =>
    r.claimedByMe &&
    r.shift.status === 'claimed' &&
    new Date(r.shift.endsAt) >= now
  );

  const load = useCallback(() => {
    refreshWhistles('village');
    refreshWhistles('mine');
    refreshBell();
  }, [refreshWhistles, refreshBell]);

  // Auto-dismiss claim errors after 5s. Release errors stay until the user acts.
  useEffect(() => {
    if (!error || releasingId) return;
    const id = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(id);
  }, [error, releasingId]);

  const animateOut = useCallback((id: string, onDone: () => void) => {
    setAnimatingIds(prev => new Set(prev).add(id));
    const timer = setTimeout(() => {
      setAnimatingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      onDone();
    }, 280);
    return timer;
  }, []);

  // Track pending timers so we can clean up on unmount
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => {
    const t = timers.current;
    return () => { t.forEach(clearTimeout); };
  }, []);

  async function claim(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/whistles/${id}/claim`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'claim failed');
      }
      // Animate card out of Open section, then re-fetch (it will appear in My Whistles)
      const timer = animateOut(id, () => load());
      timers.current.add(timer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'claim failed');
    } finally {
      setBusyId(null);
    }
  }

  async function unclaim(id: string, reason: string) {
    if (releasingId !== id) {
      setReleasingId(id);
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/whistles/${id}/unclaim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'unclaim failed');
      }
      setReleasingId(null);
      // Animate card out of My Whistles, then re-fetch (it will appear in Open)
      const timer = animateOut(id, () => load());
      timers.current.add(timer);
    } catch (err) {
      // Keep releasingId set so the release form stays open while the error is visible.
      setError(err instanceof Error ? err.message : 'unclaim failed');
      return;
    } finally {
      setBusyId(null);
    }
  }

  const firstLoad = (whistlesLoading['village'] && villageRows.length === 0) ||
    (whistlesLoading['mine'] && mineRows.length === 0);

  const showMySection = filter === 'all';

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: G.bg, color: G.ink }}>
      <GMasthead
        leftAction={<HouseholdSwitcher />}
        right={myRows.length > 0 ? `${myRows.length} mine` : ''}
        title={getCopy().request.tabLabel}
        tagline={filter === 'open' ? 'Open requests from your circle.' : `Open requests and ${getCopy().request.tabLabel} you've claimed.`}
      />

      {activeBell && (
        <button
          type="button"
          onClick={onViewLantern}
          style={{
            margin: '12px 20px 4px',
            padding: '10px 12px',
            border: `1px solid ${G.mustard}`,
            borderRadius: 10,
            background: 'rgba(217, 164, 65, 0.18)',
            color: G.ink,
            fontFamily: G.serif,
            fontStyle: 'italic',
            fontSize: 14,
            lineHeight: 1.35,
            textAlign: 'left',
            cursor: onViewLantern ? 'pointer' : 'default',
            flexShrink: 0,
          }}
        >
          🪔 Lantern lit — {activeBell.reason}
        </button>
      )}

      <SegmentControl value={filter} onChange={setFilter} />

      {error && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            position: 'fixed', left: 16, right: 16, bottom: 'calc(92px + env(safe-area-inset-bottom, 0px))', zIndex: 50,
            padding: '12px 14px', borderRadius: 10,
            background: ERROR_BG, color: ERROR_TEXT,
            border: `1px solid ${G.hairline2}`,
            boxShadow: '0 8px 24px rgba(27,23,19,0.12)',
            display: 'flex', alignItems: 'center', gap: 10,
            fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, lineHeight: 1.4,
          }}
        >
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            aria-label="Dismiss"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: ERROR_TEXT, fontFamily: G.sans, fontSize: 11, fontWeight: 700,
              letterSpacing: 1.2, textTransform: 'uppercase', padding: '4px 6px',
            }}
          >Dismiss</button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: `4px 24px calc(100px + env(safe-area-inset-bottom, 0px))` }}>
        {firstLoad && (
          <div style={{ padding: '30px 0', textAlign: 'center', fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 13 }}>
            Loading {getCopy().request.tabLabel}…
          </div>
        )}

        {!firstLoad && (
          <>
            {/* ── Open Whistles ── */}
            {openRows.length === 0 && !animatingIds.size ? (
              <div style={{
                marginTop: 32, padding: '36px 20px', textAlign: 'center',
                border: `1px dashed ${G.hairline2}`, borderRadius: 12,
                fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 14,
              }}>
                No open {getCopy().request.tabLabel.toLowerCase()} right now.
              </div>
            ) : (
              groupByDate(openRows.filter(r => !animatingIds.has(r.shift.id))).map(({ key, label, rows }) => (
                <div key={key}>
                  <SectionDivider label={label} />
                  {rows.map((r, i) => (
                    <ShiftCard
                      key={r.shift.id} row={r} first={i === 0}
                      onClaim={claim}
                      busy={busyId === r.shift.id}
                      animating={animatingIds.has(r.shift.id)}
                      isHighlighted={r.shift.id === highlightWhistleId}
                    />
                  ))}
                </div>
              ))
            )}

            {/* ── My Whistles (All mode only) ── */}
            {showMySection && (
              <>
                <SectionDivider label={`My ${getCopy().request.tabLabel}`} />
                {myRows.length === 0 && !animatingIds.size ? (
                  <div style={{
                    padding: '24px 20px', textAlign: 'center',
                    fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 13,
                  }}>
                    Nothing claimed yet.
                  </div>
                ) : (
                  groupByDate(myRows.filter(r => !animatingIds.has(r.shift.id))).map(({ key, label, rows }) => (
                    <div key={key}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 4px',
                      }}>
                        <div style={{ flex: 1, height: 1, background: G.hairline }} />
                        <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 10, color: G.muted }}>{label}</div>
                        <div style={{ flex: 1, height: 1, background: G.hairline }} />
                      </div>
                      {rows.map((r, i) => (
                        <ShiftCard
                          key={r.shift.id} row={r} first={i === 0}
                          onClaim={claim}
                          onUnclaim={unclaim}
                          mine
                          busy={busyId === r.shift.id}
                          releasingUnclaim={releasingId === r.shift.id}
                          onCancelUnclaim={() => setReleasingId(null)}
                          animating={animatingIds.has(r.shift.id)}
                          isHighlighted={r.shift.id === highlightWhistleId}
                        />
                      ))}
                    </div>
                  ))
                )}
                <div style={{
                  marginTop: 18, padding: '14px 12px', textAlign: 'center',
                  borderTop: `1px solid ${G.hairline}`,
                  fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 12,
                }}>
                  That&apos;s your schedule.
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
