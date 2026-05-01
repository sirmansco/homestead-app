'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { G } from './tokens';
import { GMasthead } from './shared';
import { HouseholdSwitcher } from './HouseholdSwitcher';
import { fmtTimeRange, durationH, fmtDateShort, fmtMonthAbbr, fmtDayOfWeek, fmtDayOfWeekLong } from '@/lib/format/time';
import { getCopy } from '@/lib/copy';

type ShiftRow = {
  shift: {
    id: string;
    title: string;
    forWhom: string | null;
    notes: string | null;
    startsAt: string;
    endsAt: string;
    rateCents: number | null;
    status: 'open' | 'claimed' | 'cancelled' | 'done';
    householdId: string;
    claimedByUserId: string | null;
  };
  household: { id: string; name: string; glyph: string } | null;
  creator: { id: string; name: string } | null;
  claimedByMe?: boolean;
  createdByMe?: boolean;
};

type ApiResponse = { shifts: ShiftRow[]; meClerkUserId?: string };

function fmtWhen(startIso: string) {
  const s = new Date(startIso);
  const now = new Date();
  const days = Math.round((s.getTime() - now.setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return 'Tonight';
  if (days === 1) return 'Tomorrow';
  if (days > 1 && days < 7) return fmtDayOfWeekLong(s);
  return fmtDateShort(s);
}
function groupByDate(rows: ShiftRow[]): { key: string; label: string; rows: ShiftRow[] }[] {
  // Use ISO date (YYYY-MM-DD) as the stable map key so group identity
  // doesn't change if fmtWhen labels flip at midnight.
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

function ShiftCard({ row, onClaim, onUnclaim, first, busy, mine, releasingUnclaim, onCancelUnclaim }: {
  row: ShiftRow;
  onClaim: (id: string) => void;
  onUnclaim?: (id: string, reason: string) => void;
  first?: boolean;
  busy?: boolean;
  mine?: boolean;
  releasingUnclaim?: boolean;
  onCancelUnclaim?: () => void;
}) {
  const s = new Date(row.shift.startsAt);
  const month = fmtMonthAbbr(s);
  const dayLarge = String(s.getDate());
  const dow = fmtDayOfWeek(s);

  return (
    <article style={{ paddingTop: first ? 4 : 12, paddingBottom: 12, borderBottom: `1px solid ${G.hairline}` }}>
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
                }}>{busy ? 'Claiming…' : 'Claim'}</button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function ScreenShifts() {
  // rows: null = loading, [] = loaded (even if empty)
  const [rows, setRows] = useState<ShiftRow[] | null>(null);
  const [myRows, setMyRows] = useState<ShiftRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const mineRes = await fetch('/api/shifts?scope=mine');
      // 401 = not signed in, 409 = no household yet — valid empty states, not errors
      if (mineRes.status === 401 || mineRes.status === 409) {
        setRows([]);
        setMyRows([]);
        return;
      }
      if (!mineRes.ok) throw new Error(`Failed (${mineRes.status})`);
      const mine = await mineRes.json() as ApiResponse;
      // My Schedule = only future shifts I've claimed
      const claimed = mine.shifts.filter(r =>
        r.claimedByMe && r.shift.status === 'claimed' && new Date(r.shift.endsAt) >= new Date()
      );
      setMyRows(claimed);
      setRows([]); // open shifts are on ScreenAlmanac, not here
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    load();
    // Re-poll when the tab regains focus — caregiver may have claimed/cancelled
    // a shift while the user was elsewhere. Mirrors BellIncoming behavior.
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // Auto-dismiss the error toast after 5s so it doesn't linger past the user's read.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(id);
  }, [error]);

  async function claim(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/shifts/${id}/claim`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'claim failed');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'claim failed');
    } finally {
      setBusyId(null);
    }
  }

  async function unclaim(id: string, reason: string) {
    // First tap (no reason) → show the release form for this shift
    if (releasingId !== id) {
      setReleasingId(id);
      return;
    }
    // Second tap (from ReleaseForm confirm) → actually release
    setBusyId(id);
    try {
      const res = await fetch(`/api/shifts/${id}/unclaim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'unclaim failed');
      }
      setReleasingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unclaim failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: G.bg, color: G.ink }}>
      <GMasthead
        leftAction={<HouseholdSwitcher />}
        right={myRows.length > 0 ? `${myRows.length} ${getCopy().request.tabLabel.toLowerCase().replace(/s$/, '')}${myRows.length === 1 ? '' : 's'}` : ''}
        title="My Schedule"
        tagline={myRows.length > 0 ? `${getCopy().request.tabLabel} you've claimed. Release if something comes up.` : `${getCopy().request.tabLabel} you claim will appear here.`}
      />

      {error && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            position: 'fixed', left: 16, right: 16, bottom: 92, zIndex: 50,
            padding: '12px 14px', borderRadius: 10,
            background: '#FFE6DA', color: '#7A2F12',
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
              color: '#7A2F12', fontFamily: G.sans, fontSize: 11, fontWeight: 700,
              letterSpacing: 1.2, textTransform: 'uppercase', padding: '4px 6px',
            }}
          >Dismiss</button>
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 100px' }}>
        {rows === null && (
          <div style={{ padding: '30px 0', textAlign: 'center', fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 13 }}>
            Loading your schedule…
          </div>
        )}
        {rows !== null && myRows.length === 0 && (
          <div style={{
            marginTop: 32, padding: '36px 20px', textAlign: 'center',
            border: `1px dashed ${G.hairline2}`, borderRadius: 12,
            fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 14,
          }}>
            Nothing claimed yet.
            <div style={{ marginTop: 8, fontSize: 12 }}>
              Head to <strong style={{ fontStyle: 'normal' }}>Open {getCopy().request.tabLabel}</strong> to find something to claim.
            </div>
          </div>
        )}
        {myRows.length > 0 && (
          <>
            {groupByDate(myRows).map(({ key, label, rows }) => (
              <div key={key}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 6px',
                }}>
                  <div style={{ width: 18, height: 1, background: G.ink }} />
                  <div style={{
                    fontFamily: G.sans, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase',
                    color: G.ink, fontWeight: 700, whiteSpace: 'nowrap',
                  }}>{label}</div>
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
                  />
                ))}
              </div>
            ))}
            <div style={{
              marginTop: 18, padding: '14px 12px', textAlign: 'center',
              borderTop: `1px solid ${G.hairline}`,
              fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 12,
            }}>
              That&apos;s your schedule.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
