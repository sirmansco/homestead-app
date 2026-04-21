'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { G } from './tokens';
import { GMasthead, GLabel, SectionHead } from './shared';
import { HouseholdSwitcher, useHousehold } from './HouseholdSwitcher';

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
};

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
function bucketOf(iso: string): 'today' | 'tomorrow' | 'week' | 'later' {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return 'week';
  return 'later';
}

function StatusCard({ row, accent, tagline, onCancel, cancelling }: {
  row: ShiftRow; accent: string; tagline: string;
  onCancel?: (id: string) => void; cancelling?: boolean;
}) {
  return (
    <div style={{
      background: G.paper, border: `1px solid ${G.hairline2}`,
      borderRadius: 8, padding: 16, position: 'relative', marginBottom: 10,
    }}>
      <div style={{
        position: 'absolute', top: -1, left: -1, width: 4, height: 'calc(100% + 2px)',
        background: accent, borderRadius: '8px 0 0 8px',
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <GLabel color={accent}>{tagline}</GLabel>
          <div style={{ fontFamily: G.display, fontSize: 22, fontWeight: 500, color: G.ink, marginTop: 4, lineHeight: 1.15 }}>
            {row.shift.title}
          </div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', color: G.ink2, fontSize: 13, marginTop: 4 }}>
            {fmtTimeRange(row.shift.startsAt, row.shift.endsAt)}
            {row.shift.forWhom && <> · For {row.shift.forWhom}</>}
          </div>
          {row.shift.notes && (
            <div style={{ fontFamily: G.serif, fontSize: 13, color: G.ink2, marginTop: 6, lineHeight: 1.4 }}>
              {row.shift.notes}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: G.display, fontSize: 22, color: accent }}>{durationH(row.shift.startsAt, row.shift.endsAt)}</div>
        </div>
      </div>
      {onCancel && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            onClick={() => {
              if (confirm('Cancel this shift? Your village will see it disappear.')) onCancel(row.shift.id);
            }}
            disabled={cancelling}
            style={{
              padding: '6px 12px', background: 'transparent',
              border: `1px solid ${G.hairline2}`, borderRadius: 6, color: G.muted,
              fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
              textTransform: 'uppercase', cursor: cancelling ? 'wait' : 'pointer',
            }}
          >{cancelling ? 'Cancelling…' : 'Cancel'}</button>
        </div>
      )}
    </div>
  );
}

function EmptyHome({ onRing, role }: { onRing?: () => void; role: 'parent' | 'caregiver' }) {
  return (
    <div style={{
      margin: '18px 0', padding: '26px 20px', textAlign: 'center',
      border: `1px dashed ${G.hairline2}`, borderRadius: 10, background: G.paper,
    }}>
      <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 20, color: G.ink, lineHeight: 1.3 }}>
        {role === 'parent' ? 'Nothing on the books yet.' : 'No shifts yet.'}
      </div>
      <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted, marginTop: 6 }}>
        {role === 'parent'
          ? 'Post a need to get started. Ring the bell for something urgent.'
          : 'Open shifts from your villages will land on Shifts tab.'}
      </div>
      {role === 'parent' && (
        <button onClick={onRing} style={{
          marginTop: 14, padding: '10px 18px',
          background: G.ink, color: '#FBF7F0',
          border: 'none', borderRadius: 6,
          fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
          textTransform: 'uppercase', cursor: 'pointer',
        }}>Ring the Bell</button>
      )}
    </div>
  );
}

export function ScreenHome({ onRing, role = 'parent' }: {
  onRing?: () => void;
  role?: 'parent' | 'caregiver';
}) {
  const { active } = useHousehold();
  const [rows, setRows] = useState<ShiftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/shifts');
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json() as { shifts: ShiftRow[] };
      setRows(data.shifts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setRows([]);
    }
  }, []);

  useEffect(() => { load(); }, [load, active?.id]);

  async function cancelShift(id: string) {
    setCancellingId(id);
    try {
      const res = await fetch(`/api/shifts/${id}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'cancel failed');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'cancel failed');
    } finally {
      setCancellingId(null);
    }
  }

  const upcoming = (rows || []).filter(r => new Date(r.shift.endsAt) >= new Date());
  const today = upcoming.filter(r => bucketOf(r.shift.startsAt) === 'today');
  const tomorrow = upcoming.filter(r => bucketOf(r.shift.startsAt) === 'tomorrow');
  const week = upcoming.filter(r => bucketOf(r.shift.startsAt) === 'week');

  const title = role === 'caregiver' ? 'Your Week' : (active?.name || 'The Homestead');
  const tagline = rows === null ? 'Loading…'
    : upcoming.length === 0 ? 'Nothing on the books yet.'
    : role === 'parent'
      ? `${upcoming.filter(r => r.shift.status === 'claimed').length} claimed · ${upcoming.filter(r => r.shift.status === 'open').length} still open.`
      : `${upcoming.filter(r => r.shift.status === 'claimed').length} shifts claimed by someone in your village.`;

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: G.bg, color: G.ink }}>
      <GMasthead
        leftAction={<HouseholdSwitcher />}
        right={new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
        title={title}
        tagline={tagline}
        folioRight="Homestead Press"
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
            Loading your week…
          </div>
        )}
        {rows && upcoming.length === 0 && <EmptyHome onRing={onRing} role={role} />}

        {today.length > 0 && <>
          <SectionHead label="Today" />
          {today.map(r => (
            <StatusCard
              key={r.shift.id} row={r}
              accent={r.shift.status === 'claimed' ? G.green : G.clay}
              tagline={r.shift.status === 'claimed' ? 'Covered' : 'Open · needs someone'}
              onCancel={role === 'parent' ? cancelShift : undefined}
              cancelling={cancellingId === r.shift.id}
            />
          ))}
        </>}

        {tomorrow.length > 0 && <>
          <SectionHead label="Tomorrow" />
          {tomorrow.map(r => (
            <StatusCard
              key={r.shift.id} row={r}
              accent={r.shift.status === 'claimed' ? G.green : G.clay}
              tagline={r.shift.status === 'claimed' ? 'Covered' : 'Open · needs someone'}
              onCancel={role === 'parent' ? cancelShift : undefined}
              cancelling={cancellingId === r.shift.id}
            />
          ))}
        </>}

        {week.length > 0 && <>
          <SectionHead label="This week" />
          {week.map(r => (
            <StatusCard
              key={r.shift.id} row={r}
              accent={r.shift.status === 'claimed' ? G.green : G.clay}
              tagline={r.shift.status === 'claimed' ? 'Covered' : 'Open · needs someone'}
              onCancel={role === 'parent' ? cancelShift : undefined}
              cancelling={cancellingId === r.shift.id}
            />
          ))}
        </>}
      </div>
    </div>
  );
}
