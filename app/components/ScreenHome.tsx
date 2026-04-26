'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { G } from './tokens';
import { GMasthead, GLabel, SectionHead } from './shared';
import { HouseholdSwitcher, useHousehold } from './HouseholdSwitcher';
import { fmtTimeRange, durationH, fmtDateShort } from '@/lib/format/time';

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

function StatusCard({ row, accent, tagline, onCancel, onClaim, cancelling, claiming, showHousehold }: {
  row: ShiftRow; accent: string; tagline: string;
  onCancel?: (id: string) => void; cancelling?: boolean;
  onClaim?: (id: string) => void; claiming?: boolean;
  showHousehold?: boolean;
}) {
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);
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
            confirmingCancel ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => { setConfirmingCancel(false); onCancel(row.shift.id); }}
                  style={{
                    padding: '6px 12px', background: G.ink, color: '#FBF7F0',
                    border: 'none', borderRadius: 6,
                    fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
                    textTransform: 'uppercase', cursor: 'pointer',
                  }}>Yes, cancel</button>
                <button
                  onClick={() => setConfirmingCancel(false)}
                  style={{
                    padding: '6px 12px', background: 'transparent', color: G.muted,
                    border: `1px solid ${G.hairline2}`, borderRadius: 6,
                    fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
                    textTransform: 'uppercase', cursor: 'pointer',
                  }}>Keep</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingCancel(true)}
                disabled={cancelling}
                style={{
                  padding: '6px 12px', background: 'transparent',
                  border: `1px solid ${G.hairline2}`, borderRadius: 6, color: G.muted,
                  fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
                  textTransform: 'uppercase', cursor: cancelling ? 'wait' : 'pointer',
                }}
              >{cancelling ? 'Cancelling…' : 'Cancel'}</button>
            )
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

function Step({ num, done, title, sub, action }: {
  num: number; done: boolean; title: string; sub: string; action?: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', gap: 14, padding: '14px 0',
      borderBottom: `1px solid ${G.hairline}`,
    }}>
      <div style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: 28,
        background: done ? G.green : G.ink, color: '#FBF7F0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: G.display, fontSize: 13, fontWeight: 500,
      }}>
        {done ? '✓' : num}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: G.display, fontSize: 16, fontWeight: 500, color: done ? G.muted : G.ink,
          textDecoration: done ? 'line-through' : 'none', lineHeight: 1.2,
        }}>{title}</div>
        <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginTop: 3, lineHeight: 1.4 }}>
          {sub}
        </div>
        {!done && action && <div style={{ marginTop: 10 }}>{action}</div>}
      </div>
    </div>
  );
}

function EmptyHome({ onRing, onPost, onVillage, role, villageSize }: {
  onRing?: () => void;
  onPost?: () => void;
  onVillage?: () => void;
  role: 'parent' | 'caregiver';
  villageSize: number;
}) {
  if (role === 'caregiver') {
    return (
      <div style={{
        margin: '18px 0', padding: '26px 20px', textAlign: 'center',
        border: `1px dashed ${G.hairline2}`, borderRadius: 10, background: G.paper,
      }}>
        <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 20, color: G.ink, lineHeight: 1.3 }}>
          All clear.
        </div>
        <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted, marginTop: 6 }}>
          No shifts posted yet. Check the Shifts tab for open needs from your village.
        </div>
      </div>
    );
  }

  const hasVillage = villageSize > 0;

  return (
    <div style={{ margin: '18px 0' }}>
      <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 22, color: G.ink, lineHeight: 1.2, marginBottom: 4 }}>
        Let&apos;s get set up.
      </div>
      <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted, marginBottom: 16 }}>
        Three steps and your household is ready.
      </div>

      <Step
        num={1}
        done={true}
        title="Name your homestead"
        sub="Your household has a name. Good start."
      />
      <Step
        num={2}
        done={hasVillage}
        title="Invite your village"
        sub="Add a grandparent, sitter, or trusted friend. They can claim shifts and answer the bell."
        action={
          <button onClick={onVillage} style={{
            padding: '8px 16px',
            background: G.ink, color: '#FBF7F0',
            border: 'none', borderRadius: 6,
            fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
            textTransform: 'uppercase', cursor: 'pointer',
          }}>Go to Village →</button>
        }
      />
      <Step
        num={3}
        done={false}
        title="Post your first need"
        sub="Pick a date, a time, and who it's for. Your village gets notified."
        action={hasVillage ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={onPost} style={{
              padding: '8px 16px',
              background: G.ink, color: '#FBF7F0',
              border: 'none', borderRadius: 6,
              fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
              textTransform: 'uppercase', cursor: 'pointer',
            }}>Post a Need →</button>
            <button onClick={onRing} style={{
              padding: '8px 16px',
              background: 'transparent', color: G.ink,
              border: `1px solid ${G.hairline2}`, borderRadius: 6,
              fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
              textTransform: 'uppercase', cursor: 'pointer',
            }}>Ring the Bell</button>
          </div>
        ) : (
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted }}>
            Invite someone first, then post a need.
          </div>
        )}
      />
    </div>
  );
}

export function ScreenHome({ onRing, onPost, onVillage, role = 'parent' }: {
  onRing?: () => void;
  onPost?: () => void;
  onVillage?: () => void;
  role?: 'parent' | 'caregiver';
}) {
  const { active, all } = useHousehold();
  const multiHousehold = all.length > 1;
  const [rows, setRows] = useState<ShiftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [villageSize, setVillageSize] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Multi-household users get a unified view across all their households.
      // Single-household: parent sees their own household, caregiver sees open village shifts.
      const scope = multiHousehold ? 'all' : role === 'caregiver' ? 'village' : 'household';
      const [shiftsRes, villageRes] = await Promise.all([
        fetch(`/api/shifts?scope=${scope}`),
        role === 'parent' ? fetch('/api/village') : Promise.resolve(null),
      ]);
      if (!shiftsRes.ok) throw new Error(`Failed (${shiftsRes.status})`);
      const data = await shiftsRes.json() as { shifts: ShiftRow[] };
      setRows(data.shifts);
      if (villageRes?.ok) {
        const v = await villageRes.json();
        setVillageSize((v.adults?.length ?? 0) + (v.kids?.length ?? 0));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setRows([]);
    }
  }, [role, multiHousehold]);

  useEffect(() => { load(); }, [load, active?.id, multiHousehold]);

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
  const today = upcoming.filter(r => bucketOf(r.shift.startsAt) === 'today');
  const tomorrow = upcoming.filter(r => bucketOf(r.shift.startsAt) === 'tomorrow');
  const week = upcoming.filter(r => bucketOf(r.shift.startsAt) === 'week');

  const title = multiHousehold ? 'Your Week' : role === 'caregiver' ? 'Your Week' : (active?.name || 'The Homestead');
  const tagline = rows === null ? 'Loading…'
    : upcoming.length === 0 ? 'Nothing on the books yet.'
    : multiHousehold
      ? `${upcoming.filter(r => r.shift.status === 'open').length} open · ${upcoming.filter(r => r.claimedByMe).length} you're covering.`
      : role === 'parent'
        ? `${upcoming.filter(r => r.shift.status === 'claimed').length} claimed · ${upcoming.filter(r => r.shift.status === 'open').length} still open.`
        : `${upcoming.filter(r => r.shift.status === 'claimed').length} shifts claimed by someone in your village.`;

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: G.bg, color: G.ink }}>
      <GMasthead
        leftAction={<HouseholdSwitcher />}
        right={fmtDateShort(new Date())}
        title={title}
        tagline={tagline}
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
        {rows && upcoming.length === 0 && (
          <EmptyHome onRing={onRing} onPost={onPost} onVillage={onVillage} role={role} villageSize={villageSize} />
        )}

        {today.length > 0 && <>
          <SectionHead label="Today" />
          {today.map(r => (
            <StatusCard
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
            <StatusCard
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
            <StatusCard
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
