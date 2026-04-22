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

function fmtRate(cents: number | null | undefined) {
  if (cents == null) return null;
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function ShiftCard({ row, accent, tagline, onCancel, onClaim, cancelling, claiming, showHousehold, onOpen }: {
  row: ShiftRow; accent: string; tagline: string;
  onCancel?: (id: string) => void; cancelling?: boolean;
  onClaim?: (id: string) => void; claiming?: boolean;
  showHousehold?: boolean;
  onOpen?: (row: ShiftRow) => void;
}) {
  const rate = fmtRate(row.shift.rateCents);
  return (
    <div
      onClick={onOpen ? () => onOpen(row) : undefined}
      style={{
        background: G.paper, border: `1px solid ${G.hairline2}`,
        borderRadius: 8, padding: 16, position: 'relative', marginBottom: 10,
        cursor: onOpen ? 'pointer' : 'default',
      }}
    >
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
          {rate && (
            <div style={{ fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1, color: G.ink, marginTop: 2 }}>
              {rate}
            </div>
          )}
        </div>
      </div>
      {(onCancel || onClaim) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          {onCancel && (
            <button
              onClick={(e) => {
                e.stopPropagation();
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
              onClick={(e) => { e.stopPropagation(); onClaim(row.shift.id); }}
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

function ShiftDetailSheet({ row, onClose, onClaim, claiming, canClaim }: {
  row: ShiftRow; onClose: () => void;
  onClaim?: (id: string) => void; claiming?: boolean; canClaim?: boolean;
}) {
  const rate = fmtRate(row.shift.rateCents);
  const d = new Date(row.shift.startsAt);
  const dateLabel = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, background: G.bg,
          borderRadius: '16px 16px 0 0', padding: '20px 20px 32px',
          maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        {row.household && (
          <HouseholdChip name={row.household.name} glyph={row.household.glyph} />
        )}
        <div style={{ fontFamily: G.display, fontSize: 26, fontWeight: 500, color: G.ink, lineHeight: 1.2, marginTop: 4 }}>
          {row.shift.title}
        </div>
        <div style={{ fontFamily: G.serif, fontStyle: 'italic', color: G.ink2, fontSize: 14, marginTop: 6 }}>
          {dateLabel} · {fmtTimeRange(row.shift.startsAt, row.shift.endsAt)} · {durationH(row.shift.startsAt, row.shift.endsAt)}
        </div>
        {row.shift.forWhom && (
          <div style={{ marginTop: 14 }}>
            <GLabel>For</GLabel>
            <div style={{ fontFamily: G.serif, fontSize: 14, color: G.ink, marginTop: 2 }}>{row.shift.forWhom}</div>
          </div>
        )}
        {rate && (
          <div style={{ marginTop: 14 }}>
            <GLabel>Rate</GLabel>
            <div style={{ fontFamily: G.display, fontSize: 22, color: G.ink, marginTop: 2 }}>{rate}</div>
          </div>
        )}
        {row.shift.notes && (
          <div style={{ marginTop: 14 }}>
            <GLabel>Notes</GLabel>
            <div style={{ fontFamily: G.serif, fontSize: 14, color: G.ink2, marginTop: 2, lineHeight: 1.5 }}>
              {row.shift.notes}
            </div>
          </div>
        )}
        {row.creator && (
          <div style={{ marginTop: 14 }}>
            <GLabel>Posted by</GLabel>
            <div style={{ fontFamily: G.serif, fontSize: 14, color: G.ink, marginTop: 2 }}>{row.creator.name.split(' ')[0]}</div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '12px', background: 'transparent',
              border: `1px solid ${G.hairline2}`, borderRadius: 8, color: G.ink,
              fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.4,
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >Close</button>
          {canClaim && onClaim && (
            <button
              onClick={() => onClaim(row.shift.id)}
              disabled={claiming}
              style={{
                flex: 2, padding: '12px', background: G.ink, color: '#FBF7F0',
                border: 'none', borderRadius: 8,
                fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.4,
                textTransform: 'uppercase', cursor: claiming ? 'wait' : 'pointer',
                opacity: claiming ? 0.7 : 1,
              }}
            >{claiming ? 'Claiming…' : 'Claim this shift'}</button>
          )}
        </div>
      </div>
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
        width: 38, height: 38, borderRadius: 38,
        background: G.clay, border: 'none', cursor: 'pointer',
        padding: 0, color: '#FBF7F0',
        boxShadow: '0 2px 6px rgba(181,52,43,0.35)',
      }}
    >
      {Icons.bell('#FBF7F0')}
    </button>
  );
}

export function ScreenAlmanac({ role = 'parent', isDualRole = false, onRing, onPost }: {
  role?: 'parent' | 'caregiver';
  isDualRole?: boolean;
  onRing?: () => void;
  onPost?: () => void;
}) {
  const { active, all, rolesByHousehold } = useHousehold();
  const multiHousehold = all.length > 1;
  const [rows, setRows] = useState<ShiftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<ShiftRow | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Dual-role and multi-household users always get the unified scope
      const scope = (isDualRole || multiHousehold) ? 'all' : role === 'caregiver' ? 'village' : 'household';
      const res = await fetch(`/api/shifts?scope=${scope}`);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json() as { shifts: ShiftRow[] };
      setRows(data.shifts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setRows([]);
    }
  }, [role, isDualRole, multiHousehold]);

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

  const upcoming = (rows || []).filter(r => new Date(r.shift.endsAt) >= new Date() && r.shift.status !== 'cancelled');

  // Dual-role split: own household vs other families needing help
  const myHouseholdId = active?.id;
  const ownShifts = isDualRole
    ? upcoming.filter(r => r.shift.householdId === myHouseholdId)
    : upcoming;
  const helpNeeded = isDualRole
    ? upcoming.filter(r => r.shift.householdId !== myHouseholdId && r.shift.status === 'open' && !r.claimedByMe)
    : [];
  const myCaregiverClaimed = isDualRole
    ? upcoming.filter(r => r.shift.householdId !== myHouseholdId && r.claimedByMe)
    : [];

  const today    = ownShifts.filter(r => bucketOf(r.shift.startsAt) === 'today');
  const tomorrow = ownShifts.filter(r => bucketOf(r.shift.startsAt) === 'tomorrow');
  const week     = ownShifts.filter(r => bucketOf(r.shift.startsAt) === 'week');
  const later    = ownShifts.filter(r => bucketOf(r.shift.startsAt) === 'later');

  function possessive(name: string) {
    // Strip generic suffixes so "Sirmans Household" → "Sirmans"
    const cleaned = name.replace(/\s+(household|family|home|house)s?$/i, '').trim();
    return cleaned.endsWith('s') ? `${cleaned}'` : `${cleaned}'s`;
  }
  const title = role === 'caregiver' ? 'My Schedule' : (active?.name ? `${possessive(active.name)} Almanac` : 'The Almanac');

  let tagline = 'Loading…';
  if (rows !== null) {
    if (isDualRole) {
      const parts = [
        ownShifts.filter(r => r.shift.status === 'open').length > 0
          ? `${ownShifts.filter(r => r.shift.status === 'open').length} open in your household` : null,
        myCaregiverClaimed.length > 0 ? `${myCaregiverClaimed.length} you're covering` : null,
        helpNeeded.length > 0 ? `${helpNeeded.length} available to help with` : null,
      ].filter(Boolean);
      tagline = parts.length ? parts.join(' · ') : 'All covered.';
    } else if (upcoming.length === 0) {
      tagline = 'Nothing on the books yet.';
    } else if (multiHousehold) {
      tagline = `${upcoming.filter(r => r.shift.status === 'open').length} open · ${upcoming.filter(r => r.claimedByMe).length} you're covering.`;
    } else if (role === 'parent') {
      tagline = `${upcoming.filter(r => r.shift.status === 'claimed').length} claimed · ${upcoming.filter(r => r.shift.status === 'open').length} still open.`;
    } else {
      tagline = `${upcoming.filter(r => r.claimedByMe).length} shifts you're covering.`;
    }
  }

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
        {rows && ownShifts.length === 0 && helpNeeded.length === 0 && myCaregiverClaimed.length === 0 && (
          <EmptyAlmanac onRing={onRing} onPost={onPost} role={role} />
        )}

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
              onOpen={setOpenRow}
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
              onOpen={setOpenRow}
            />
          ))}
        </>}

        {week.length > 0 && <>
          <SectionHead label="This week" />
          {(() => {
            const byDay = new Map<string, ShiftRow[]>();
            week.forEach(r => {
              const d = new Date(r.shift.startsAt);
              const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
              const list = byDay.get(key) ?? [];
              list.push(r);
              byDay.set(key, list);
            });
            return Array.from(byDay.entries()).map(([key, dayRows]) => {
              const first = new Date(dayRows[0].shift.startsAt);
              const label = first.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
              return (
                <React.Fragment key={key}>
                  <div style={{
                    fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
                    textTransform: 'uppercase', color: G.muted,
                    margin: '14px 0 8px', paddingBottom: 4,
                    borderBottom: `1px solid ${G.hairline2}`,
                  }}>{label}</div>
                  {dayRows.map(r => (
                    <ShiftCard
                      key={r.shift.id} row={r}
                      accent={r.shift.status === 'claimed' ? G.green : G.clay}
                      tagline={r.shift.status === 'claimed' ? 'Covered' : 'Open · needs someone'}
                      onCancel={role === 'parent' && r.createdByMe ? cancelShift : undefined}
                      cancelling={cancellingId === r.shift.id}
                      onClaim={r.shift.status === 'open' && !r.createdByMe ? claimShift : undefined}
                      claiming={claimingId === r.shift.id}
                      showHousehold={multiHousehold}
                      onOpen={setOpenRow}
                    />
                  ))}
                </React.Fragment>
              );
            });
          })()}
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
              onOpen={setOpenRow}
            />
          ))}
        </>}

        {/* ── Dual-role: shifts from families the user helps with ── */}
        {isDualRole && (myCaregiverClaimed.length > 0 || helpNeeded.length > 0) && (
          <>
            <div style={{
              margin: '24px 0 0',
              padding: '14px 0 10px',
              borderTop: `1px solid ${G.ink}`,
            }}>
              <GLabel color={G.ink}>Also helping with</GLabel>
              <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginTop: 2 }}>
                Open requests from other families in your village
              </div>
            </div>

            {myCaregiverClaimed.length > 0 && <>
              <SectionHead label="You're covering" />
              {myCaregiverClaimed.map(r => (
                <ShiftCard
                  key={r.shift.id} row={r}
                  accent={G.green}
                  tagline={`Covering · ${r.household?.name ?? 'another family'}`}
                  showHousehold={true}
                  onOpen={setOpenRow}
                />
              ))}
            </>}

            {helpNeeded.length > 0 && <>
              <SectionHead label="Available to help" />
              {helpNeeded.map(r => (
                <ShiftCard
                  key={r.shift.id} row={r}
                  accent={G.clay}
                  tagline={`Open · ${r.household?.name ?? 'another family'}`}
                  onClaim={claimShift}
                  claiming={claimingId === r.shift.id}
                  showHousehold={true}
                  onOpen={setOpenRow}
                />
              ))}
            </>}
          </>
        )}
      </div>
      {openRow && (
        <ShiftDetailSheet
          row={openRow}
          onClose={() => setOpenRow(null)}
          onClaim={async (id) => {
            await claimShift(id);
            setOpenRow(null);
          }}
          claiming={claimingId === openRow.shift.id}
          canClaim={openRow.shift.status === 'open' && !openRow.createdByMe}
        />
      )}
    </div>
  );
}
