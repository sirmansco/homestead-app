'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { G } from './tokens';
import { GMasthead, GLabel } from './shared';
import { HouseholdSwitcher } from './HouseholdSwitcher';
import { shortName } from '@/lib/format';

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
  if (days > 1 && days < 7) return s.toLocaleDateString(undefined, { weekday: 'long' });
  return s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTimeRange(startIso: string, endIso: string) {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${t(s)} – ${t(e)}`;
}
function durationH(startIso: string, endIso: string) {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return `${(ms / 3600000).toFixed(ms % 3600000 === 0 ? 0 : 1)}h`;
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
        Why can't you make it? The parent will be notified.
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
          padding: '7px 12px', background: G.ink, color: '#FBF7F0',
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
  const month = s.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
  const dayLarge = String(s.getDate());
  const dow = s.toLocaleDateString(undefined, { weekday: 'short' });

  return (
    <article style={{ paddingTop: first ? 4 : 16, paddingBottom: 16, borderBottom: `1px solid ${G.hairline}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <GLabel color={G.ink}>{fmtWhen(row.shift.startsAt)}</GLabel>
        <div style={{ flex: 1, height: 1, background: G.hairline }} />
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{
          width: 58, flexShrink: 0,
          border: `1px solid ${G.ink}`, borderRadius: 6, overflow: 'hidden',
          textAlign: 'center', background: G.paper,
        }}>
          <div style={{ background: G.ink, color: '#FBF7F0', fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.2, padding: '3px 0' }}>{month}</div>
          <div style={{ fontFamily: G.display, fontSize: 26, fontWeight: 500, color: G.ink, padding: '4px 0 0', lineHeight: 1 }}>{dayLarge}</div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 10, color: G.muted, paddingBottom: 4 }}>{dow}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: G.display, fontSize: 18, fontWeight: 500, color: G.ink, lineHeight: 1.15 }}>{row.shift.title}</div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.ink2, marginTop: 2 }}>
            {fmtTimeRange(row.shift.startsAt, row.shift.endsAt)}
            {row.household && <> · <span style={{ fontStyle: 'normal', color: G.muted }}>{row.household.glyph} {row.household.name}</span></>}
          </div>
          {row.shift.forWhom && (
            <div style={{ fontSize: 12, color: G.ink2, marginTop: 4, lineHeight: 1.4 }}>For {row.shift.forWhom}</div>
          )}
          {row.shift.notes && (
            <div style={{ fontSize: 12, color: G.ink2, marginTop: 4, lineHeight: 1.4 }}>{row.shift.notes}</div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingLeft: 70 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {dollars(row.shift.rateCents) && (
            <>
              <span style={{ fontFamily: G.display, fontSize: 14, color: G.ink }}>{dollars(row.shift.rateCents)}</span>
              <span style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted }}>·</span>
            </>
          )}
          <span style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted }}>{durationH(row.shift.startsAt, row.shift.endsAt)}</span>
        </div>
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
                padding: '7px 14px',
                background: 'transparent', color: G.ink,
                border: `1px solid ${G.hairline2}`, borderRadius: 100,
                fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
                textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer',
                opacity: busy ? 0.7 : 1,
              }}>{busy ? 'Releasing…' : 'Release'}</button>
          )
        ) : (
          <button
            onClick={() => onClaim(row.shift.id)}
            disabled={busy}
            style={{
              padding: '7px 14px',
              background: G.ink, color: '#FBF7F0',
              border: 'none', borderRadius: 100,
              fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
              textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}>{busy ? 'Claiming…' : 'Claim'}</button>
        )}
      </div>
    </article>
  );
}

export function ScreenShifts() {
  const [rows, setRows] = useState<ShiftRow[] | null>(null);
  const [myRows, setMyRows] = useState<ShiftRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [villageRes, mineRes] = await Promise.all([
        fetch('/api/shifts?scope=village'),
        fetch('/api/shifts?scope=mine'),
      ]);
      // 401 = not signed in, 409 = no household yet — both are valid empty states
      if (villageRes.status === 401 || villageRes.status === 409) {
        setRows([]);
        return;
      }
      if (!villageRes.ok) throw new Error(`Failed (${villageRes.status})`);
      const village = await villageRes.json() as ApiResponse;
      setRows(village.shifts);

      if (mineRes.ok) {
        const mine = await mineRes.json() as ApiResponse;
        setMyRows(mine.shifts.filter(r =>
          r.claimedByMe && r.shift.status === 'claimed' && new Date(r.shift.endsAt) >= new Date()
        ));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setRows([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const openRows = (rows || []).filter(r => r.shift.status === 'open');

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: G.bg, color: G.ink }}>
      <GMasthead
        leftAction={<HouseholdSwitcher />} right={rows ? `${openRows.length} open` : ''}
        title="Open Shifts"
        tagline="From families in your village. Claim one to lock it in."
        folioRight="The Slate"
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 120px' }}>
        {error && (
          <div style={{
            marginTop: 10, padding: '10px 12px', borderRadius: 8,
            background: '#FFE6DA', color: '#7A2F12',
            fontFamily: G.serif, fontStyle: 'italic', fontSize: 13,
          }}>{error}</div>
        )}
        {rows === null && (
          <div style={{ padding: '30px 0', textAlign: 'center', fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 13 }}>
            Loading the slate…
          </div>
        )}
        {rows && openRows.length === 0 && (
          <div style={{
            marginTop: 18, padding: '30px 16px', textAlign: 'center',
            border: `1px dashed ${G.hairline2}`, borderRadius: 8,
            fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 13,
          }}>
            No open shifts right now. Check back later.
          </div>
        )}
        {myRows.length > 0 && (
          <>
            <div style={{
              fontFamily: G.sans, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase',
              color: G.ink, fontWeight: 700, margin: '14px 0 6px',
            }}>Your claimed shifts</div>
            {myRows.map((r, i) => (
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
            <div style={{
              fontFamily: G.sans, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase',
              color: G.ink, fontWeight: 700, margin: '22px 0 6px',
            }}>Open in your villages</div>
          </>
        )}
        {openRows.map((r, i) => (
          <ShiftCard key={r.shift.id} row={r} first={i === 0 && myRows.length === 0} onClaim={claim} onUnclaim={unclaim} busy={busyId === r.shift.id} />
        ))}
        {rows && openRows.length > 0 && (
          <div style={{
            marginTop: 18, padding: '14px 12px', textAlign: 'center',
            borderTop: `1px solid ${G.hairline}`,
            fontFamily: G.serif, fontStyle: 'italic', color: G.muted, fontSize: 12,
          }}>
            That&apos;s the whole slate.
          </div>
        )}
      </div>
    </div>
  );
}
