'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { G } from './tokens';
import { GMasthead, GLabel, SectionHead, Icons } from './shared';
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
  claimedByMe?: boolean;
  createdByMe?: boolean;
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

function HouseholdChip({ name, glyph }: { name: string; glyph: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 100,
      background: G.hairline2, marginBottom: 6,
      fontFamily: G.sans, fontSize: 9, fontWeight: 700,
      letterSpacing: 1.2, textTransform: 'uppercase', color: G.muted,
    }}>
      <span style={{ fontSize: 11 }}>{glyph}</span>
      {name}
    </span>
  );
}

function ShiftCard({ row, accent, tagline, onCancel, onClaim, cancelling, claiming, showHousehold }: {
  row: ShiftRow; accent: string; tagline: string;
  onCancel?: (id: string) => void; cancelling?: boolean;
  onClaim?: (id: string) => void; claiming?: boolean;
  showHousehold?: boolean;
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
      {showHousehold && row.household && (
        <HouseholdChip name={row.household.name} glyph={row.household.glyph} />
      )}
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
      {(onCancel || onClaim) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          {onCancel && (
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
          )}
          {onClaim && (
            <button
              onClick={() => onClaim(row.shift.id)}
              disabled={claiming}
              style={{
                padding: '7px 14px', background: G.ink, color: '#FBF7F0',
                border: 'none', borderRadius: 100,
                fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
                textTransform: 'uppercase', cursor: claiming ? 'wait' : 'pointer',
                opacity: claiming ? 0.7 : 1,
              }}
            >{claiming ? 'Claiming…' : 'Claim'}</button>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyAlmanac({ onRing, onPost, role }: { onRing?: () => void; onPost?: () => void; role: 'parent' | 'caregiver' }) {
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
          ? 'Post a need or ring the bell for something urgent.'
          : 'Open shifts from your villages will appear on the Shifts tab.'}
      </div>
      {role === 'parent' && (
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 24 }}>
          {onPost && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <button onClick={onPost} style={{
                width: 56, height: 56, borderRadius: 28,
                background: G.ink, color: '#FBF7F0',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(27,23,19,0.18)',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="#FBF7F0" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <span style={{ fontFamily: G.sans, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: G.ink }}>Post</span>
            </div>
          )}
          {onRing && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <button onClick={onRing} style={{
                width: 56, height: 56, borderRadius: 28,
                background: 'transparent', color: G.ink,
                border: `1.5px solid ${G.ink}`, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3v1.5M6.5 19.5h11M8 19.5L8 12a4 4 0 018 0v7.5M10.5 22h3a1.5 1.5 0 01-3 0z"
                    stroke={G.ink} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span style={{ fontFamily: G.sans, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: G.ink }}>Ring Bell</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BellButton({ onRing }: { onRing: () => void }) {
  return (
    <button
      onClick={onRing}
      aria-label="Ring the bell"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: 2, color: G.ink,
      }}
    >
      {Icons.bell(G.ink)}
    </button>
  );
}

export function ScreenAlmanac({ role = 'parent', onRing, onPost }: {
  role?: 'parent' | 'caregiver';
  onRing?: () => void;
  onPost?: () => void;
}) {
  const { active, all } = useHousehold();
  const multiHousehold = all.length > 1;
  const [rows, setRows] = useState<ShiftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const scope = multiHousehold ? 'all' : role === 'caregiver' ? 'village' : 'household';
      const res = await fetch(`/api/shifts?scope=${scope}`);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json() as { shifts: ShiftRow[] };
      setRows(data.shifts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setRows([]);
    }
  }, [role, multiHousehold]);

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

  async function claimShift(id: string) {
    setClaimingId(id);
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
      setClaimingId(null);
    }
  }

  const upcoming = (rows || []).filter(r => new Date(r.shift.endsAt) >= new Date());
  const today    = upcoming.filter(r => bucketOf(r.shift.startsAt) === 'today');
  const tomorrow = upcoming.filter(r => bucketOf(r.shift.startsAt) === 'tomorrow');
  const week     = upcoming.filter(r => bucketOf(r.shift.startsAt) === 'week');
  const later    = upcoming.filter(r => bucketOf(r.shift.startsAt) === 'later');

  function possessive(name: string) {
    return name.endsWith('s') ? `${name}'` : `${name}'s`;
  }
  const title = role === 'caregiver' ? 'My Schedule' : (active?.name ? `${possessive(active.name)} Almanac` : 'The Almanac');
  const tagline = rows === null ? 'Loading…'
    : upcoming.length === 0 ? 'Nothing on the books yet.'
    : multiHousehold
      ? `${upcoming.filter(r => r.shift.status === 'open').length} open · ${upcoming.filter(r => r.claimedByMe).length} you're covering.`
      : role === 'parent'
        ? `${upcoming.filter(r => r.shift.status === 'claimed').length} claimed · ${upcoming.filter(r => r.shift.status === 'open').length} still open.`
        : `${upcoming.filter(r => r.claimedByMe).length} shifts you're covering.`;

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: G.bg, color: G.ink }}>
      <GMasthead
        leftAction={<HouseholdSwitcher />}
        rightAction={role === 'parent' && onRing ? <BellButton onRing={onRing} /> : undefined}
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
            Loading your schedule…
          </div>
        )}
        {rows && upcoming.length === 0 && <EmptyAlmanac onRing={onRing} onPost={onPost} role={role} />}

        {today.length > 0 && <>
          <SectionHead label="Today" />
          {today.map(r => (
            <ShiftCard
              key={r.shift.id} row={r}
              accent={r.shift.status === 'claimed' ? G.green : G.clay}
              tagline={r.shift.status === 'claimed' ? 'Covered' : 'Open · needs someone'}
              onCancel={role === 'parent' && r.createdByMe ? cancelShift : undefined}
              cancelling={cancellingId === r.shift.id}
              onClaim={r.shift.status === 'open' && !r.createdByMe ? claimShift : undefined}
              claiming={claimingId === r.shift.id}
              showHousehold={multiHousehold}
            />
          ))}
        </>}

        {tomorrow.length > 0 && <>
          <SectionHead label="Tomorrow" />
          {tomorrow.map(r => (
            <ShiftCard
              key={r.shift.id} row={r}
              accent={r.shift.status === 'claimed' ? G.green : G.clay}
              tagline={r.shift.status === 'claimed' ? 'Covered' : 'Open · needs someone'}
              onCancel={role === 'parent' && r.createdByMe ? cancelShift : undefined}
              cancelling={cancellingId === r.shift.id}
              onClaim={r.shift.status === 'open' && !r.createdByMe ? claimShift : undefined}
              claiming={claimingId === r.shift.id}
              showHousehold={multiHousehold}
            />
          ))}
        </>}

        {week.length > 0 && <>
          <SectionHead label="This week" />
          {week.map(r => (
            <ShiftCard
              key={r.shift.id} row={r}
              accent={r.shift.status === 'claimed' ? G.green : G.clay}
              tagline={r.shift.status === 'claimed' ? 'Covered' : 'Open · needs someone'}
              onCancel={role === 'parent' && r.createdByMe ? cancelShift : undefined}
              cancelling={cancellingId === r.shift.id}
              onClaim={r.shift.status === 'open' && !r.createdByMe ? claimShift : undefined}
              claiming={claimingId === r.shift.id}
              showHousehold={multiHousehold}
            />
          ))}
        </>}

        {later.length > 0 && <>
          <SectionHead label="Coming up" />
          {later.map(r => (
            <ShiftCard
              key={r.shift.id} row={r}
              accent={r.shift.status === 'claimed' ? G.green : G.clay}
              tagline={r.shift.status === 'claimed' ? 'Covered' : 'Open · needs someone'}
              onCancel={role === 'parent' && r.createdByMe ? cancelShift : undefined}
              cancelling={cancellingId === r.shift.id}
              onClaim={r.shift.status === 'open' && !r.createdByMe ? claimShift : undefined}
              claiming={claimingId === r.shift.id}
              showHousehold={multiHousehold}
            />
          ))}
        </>}
      </div>
    </div>
  );
}
