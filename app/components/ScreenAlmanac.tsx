'use client';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { G } from './tokens';
import { GMasthead, GLabel, SectionHead, Icons } from './shared';
import { HouseholdSwitcher, useHousehold } from './HouseholdSwitcher';
import { shortName } from '@/lib/format';
import { fmtTimeRange, durationH, fmtDateShort, fmtDateLong, fmtDateMonthDay, fmtTimeOnly } from '@/lib/format/time';
import { WhenPickerDateRange, unavailRangePresets } from './WhenPicker';
import { getCopy } from '@/lib/copy';

type UnavailRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
};

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
    preferredCaregiverId: string | null;
  };
  household: { id: string; name: string; glyph: string } | null;
  creator: { id: string; name: string } | null;
  claimer: { id: string; name: string } | null;
  claimedByMe?: boolean;
  createdByMe?: boolean;
  requestedForMe?: boolean;
};

function fmtDate(iso: string) {
  return fmtDateShort(iso);
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

const HouseholdChip = React.memo(function HouseholdChip({ name, glyph }: { name: string; glyph: string }) {
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
});

// ── LanternCard ─────────────────────────────────────────────────────────────
type ActiveBellData = {
  id: string;
  reason: string;
  status: string;
  handledByName: string | null;
  createdAt: string;
  endsAt: string;
  escalatedAt: string | null;
  responses: { userId: string; response: string; name: string | null }[];
};

const RESPONSE_LABEL: Record<string, string> = {
  on_my_way: 'On the way',
  in_thirty: 'In 30 min',
  cannot: 'Can\'t cover',
};

function LanternCard({ bell, onView, onCancel, cancelling }: {
  bell: ActiveBellData;
  onView: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const AMBER = G.mustard;
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const created = new Date(bell.createdAt);
  const escalated = bell.escalatedAt ? new Date(bell.escalatedAt) : null;
  const now = new Date();
  const elapsedMs = now.getTime() - created.getTime();
  const elapsedMin = Math.floor(elapsedMs / 60_000);
  const elapsedLabel = elapsedMin < 1 ? 'just now' : elapsedMin === 1 ? '1 min ago' : `${elapsedMin} min ago`;

  const isHandled = bell.status === 'handled';
  const isEscalated = !!escalated && now >= escalated;

  // Responses grouped by type
  const onWay   = bell.responses.filter(r => r.response === 'on_my_way');
  const inThirty = bell.responses.filter(r => r.response === 'in_thirty');
  const cannot  = bell.responses.filter(r => r.response === 'cannot');

  const statusLabel = isHandled
    ? 'Help is on the way'
    : isEscalated
      ? `Widened to ${getCopy().outerRing.listTitle}`
      : `${getCopy().innerRing.listTitle} notified`;

  return (
    <div style={{
      margin: '10px 0 4px', borderRadius: 12,
      border: `1.5px solid ${AMBER}`,
      background: 'rgba(var(--mustard-rgb, 217,151,64),0.08)',
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px 8px',
        borderBottom: `1px solid ${AMBER}22`,
      }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>🪔</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: AMBER, marginBottom: 1 }}>
            {statusLabel} · {elapsedLabel}
          </div>
          <div style={{ fontFamily: G.display, fontSize: 15, fontWeight: 500, color: G.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {bell.reason}
          </div>
        </div>
      </div>

      {/* Responses */}
      {bell.responses.length > 0 && (
        <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {[...onWay, ...inThirty, ...cannot].map(r => (
            <div key={r.userId} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11 }}>
                {r.response === 'on_my_way' ? '✅' : r.response === 'in_thirty' ? '⏱' : '✗'}
              </span>
              <span style={{ fontFamily: G.sans, fontSize: 11, color: r.response === 'cannot' ? G.muted : G.ink }}>
                {r.name ?? 'Someone'} — {RESPONSE_LABEL[r.response] ?? r.response}
              </span>
            </div>
          ))}
        </div>
      )}
      {bell.responses.length === 0 && !isHandled && (
        <div style={{ padding: '6px 14px', fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted }}>
          Waiting for responses…
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px 12px' }}>
        <button onClick={onView} style={{
          flex: 1, padding: '7px 10px', borderRadius: 6,
          background: AMBER, color: '#1B1713', border: 'none',
          fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase', cursor: 'pointer',
        }}>See details</button>
        <button onClick={onCancel} disabled={cancelling} style={{
          flex: 1, padding: '7px 10px', borderRadius: 6,
          background: 'transparent', color: AMBER,
          border: `1px solid ${AMBER}`,
          fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase', cursor: cancelling ? 'wait' : 'pointer',
          opacity: cancelling ? 0.6 : 1,
        }}>{cancelling ? '…' : getCopy().urgentSignal.actionLabel.replace('Light the ', 'Mark ') === 'Mark Lantern' ? 'Mark done' : 'Mark done'}</button>
      </div>
    </div>
  );
}

function fmtRate(cents: number | null | undefined) {
  if (cents == null) return null;
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

const ShiftCard = React.memo(function ShiftCard({ row, accent, tagline, onCancel, onClaim, cancelling, claiming, showHousehold, onOpen }: {
  row: ShiftRow; accent: string; tagline: string;
  onCancel?: (id: string) => void; cancelling?: boolean;
  onClaim?: (id: string) => void; claiming?: boolean;
  showHousehold?: boolean;
  onOpen?: (row: ShiftRow) => void;
}) {
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);
  const rate = fmtRate(row.shift.rateCents);
  return (
    <div
      onClick={onOpen ? () => onOpen(row) : undefined}
      style={{
        background: G.paper, border: `1px solid ${G.hairline2}`,
        borderRadius: 8, padding: 12, position: 'relative', marginBottom: 8,
        cursor: onOpen ? 'pointer' : 'default',
      }}
    >
      <div style={{
        position: 'absolute', top: -1, left: -1, width: 3, height: 'calc(100% + 2px)',
        background: accent, borderRadius: '8px 0 0 8px',
      }} />
      {showHousehold && row.household && (
        <HouseholdChip name={row.household.name} glyph={row.household.glyph} />
      )}
      {row.requestedForMe && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4,
          padding: '2px 7px', borderRadius: 100,
          background: G.clay, color: G.bg,
          fontFamily: G.sans, fontSize: 8, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
        }}>★ Requested for you</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <GLabel color={accent}>{tagline}</GLabel>
          <div style={{ fontFamily: G.display, fontSize: 16, fontWeight: 500, color: G.ink, marginTop: 2, lineHeight: 1.2 }}>
            {row.shift.title}
          </div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', color: G.ink2, fontSize: 11, marginTop: 2 }}>
            {fmtDate(row.shift.startsAt)} · {fmtTimeRange(row.shift.startsAt, row.shift.endsAt)}
            {row.shift.forWhom && <> · For {row.shift.forWhom}</>}
          </div>
          {row.shift.notes && (
            <div style={{ fontFamily: G.serif, fontSize: 11, color: G.ink2, marginTop: 3, lineHeight: 1.4 }}>
              {row.shift.notes}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
            <div style={{ fontFamily: G.display, fontSize: 16, color: accent }}>{durationH(row.shift.startsAt, row.shift.endsAt)}</div>
            <div style={{ fontFamily: G.sans, fontSize: 8, fontWeight: 700, letterSpacing: 0.5, color: accent, opacity: 0.7 }}>hrs</div>
          </div>
          {rate && (
            <div style={{ fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: G.ink, marginTop: 1 }}>
              {rate}
            </div>
          )}
        </div>
      </div>
      {(onCancel || onClaim) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
          {onCancel && (
            confirmingCancel ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmingCancel(false); onCancel(row.shift.id); }}
                  style={{
                    padding: '5px 12px', background: G.ink, color: G.bg,
                    border: 'none', borderRadius: 100,
                    fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
                    textTransform: 'uppercase', cursor: 'pointer',
                  }}>Yes, cancel</button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmingCancel(false); }}
                  style={{
                    padding: '5px 10px', background: 'transparent', color: G.muted,
                    border: `1px solid ${G.hairline2}`, borderRadius: 100,
                    fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
                    textTransform: 'uppercase', cursor: 'pointer',
                  }}>Keep</button>
              </div>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmingCancel(true); }}
                disabled={cancelling}
                style={{
                  padding: '5px 10px', background: 'transparent',
                  border: `1px solid ${G.hairline2}`, borderRadius: 100, color: G.muted,
                  fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.4,
                  textTransform: 'uppercase', cursor: cancelling ? 'wait' : 'pointer',
                }}
              >{cancelling ? 'Cancelling…' : 'Cancel'}</button>
            )
          )}
          {onClaim && (
            <button
              onClick={(e) => { e.stopPropagation(); onClaim(row.shift.id); }}
              disabled={claiming}
              style={{
                padding: '5px 12px', background: G.ink, color: G.bg,
                border: 'none', borderRadius: 100,
                fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.4,
                textTransform: 'uppercase', cursor: claiming ? 'wait' : 'pointer',
                opacity: claiming ? 0.7 : 1,
              }}
            >{claiming ? 'Covering…' : getCopy().request.acceptVerb}</button>
          )}
        </div>
      )}
    </div>
  );
});

function ShiftDetailSheet({ row, onClose, onClaim, claiming, canClaim }: {
  row: ShiftRow; onClose: () => void;
  onClaim?: (id: string) => void; claiming?: boolean; canClaim?: boolean;
}) {
  const rate = fmtRate(row.shift.rateCents);
  const d = new Date(row.shift.startsAt);
  const dateLabel = fmtDateLong(d);
  const touchStartY = React.useRef(0);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => {
          const dragDown = e.changedTouches[0].clientY - touchStartY.current;
          // Only dismiss if dragged ≥80px AND the sheet is scrolled to the top
          // (otherwise the touch is being used for internal scroll)
          const atTop = (sheetRef.current?.scrollTop ?? 0) === 0;
          if (dragDown > 80 && atTop) onClose();
        }}
        style={{
          width: '100%', maxWidth: 480, background: G.bg,
          borderRadius: '16px 16px 0 0', padding: '20px 20px 32px',
          maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 36, height: 4, background: G.hairline2, borderRadius: 4, margin: '0 auto 16px' }} />
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
            <div style={{ fontFamily: G.serif, fontSize: 14, color: G.ink, marginTop: 2 }}>{shortName(row.creator.name)}</div>
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
                flex: 2, padding: '12px', background: G.ink, color: G.bg,
                border: 'none', borderRadius: 8,
                fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.4,
                textTransform: 'uppercase', cursor: claiming ? 'wait' : 'pointer',
                opacity: claiming ? 0.7 : 1,
              }}
            >{claiming ? 'Covering…' : `${getCopy().request.acceptVerb} this ${getCopy().request.newLabel.replace(/^New /, '').toLowerCase()}`}</button>
          )}
        </div>
      </div>
    </div>
  );
}

const OnboardStep = React.memo(function OnboardStep({ num, done, title, sub, action }: {
  num: number; done: boolean; title: string; sub: string; action?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: `1px solid ${G.hairline}` }}>
      <div style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: 28,
        background: done ? G.green : G.ink, color: G.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: G.display, fontSize: 13, fontWeight: 500,
      }}>
        {done ? '✓' : num}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: G.display, fontSize: 16, fontWeight: 500,
          color: done ? G.muted : G.ink,
          textDecoration: done ? 'line-through' : 'none', lineHeight: 1.2,
        }}>{title}</div>
        <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginTop: 3, lineHeight: 1.4 }}>
          {sub}
        </div>
        {!done && action && <div style={{ marginTop: 10 }}>{action}</div>}
      </div>
    </div>
  );
});

function EmptyAlmanac({ onRing, onPost, onVillage, role, villageSize, hasPosted }: {
  onRing?: () => void;
  onPost?: () => void;
  onVillage?: () => void;
  role: 'parent' | 'caregiver';
  villageSize: number;
  hasPosted: boolean;
}) {
  if (role === 'caregiver') {
    return (
      <div style={{
        margin: '18px 0', padding: '26px 20px', textAlign: 'center',
        border: `1px dashed ${G.hairline2}`, borderRadius: 10, background: G.paper,
      }}>
        <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 20, color: G.ink }}>
          All clear.
        </div>
        <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted, marginTop: 6 }}>
          No {getCopy().request.tabLabel.toLowerCase()} posted yet. Check the {getCopy().request.tabLabel} tab for open needs from your circle.
        </div>
      </div>
    );
  }

  const hasVillage = villageSize > 0;

  // Once there are village members, show the familiar quick-action buttons
  if (hasVillage) {
    return (
      <div style={{ margin: '16px 0 12px' }}>
        <div style={{
          borderRadius: 20,
          padding: 20,
          background: G.mustard,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div>
            <div style={{
              fontFamily: G.display,
              fontStyle: 'italic',
              fontSize: 18,
              color: G.ink,
              lineHeight: 1.2,
              marginBottom: 4,
            }}>Need help?</div>
            <div style={{
              fontFamily: G.sans,
              fontSize: 12,
              color: G.ink,
              opacity: 0.8,
            }}>Post a planned need or light the lantern for something urgent.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {onPost && (
              <button onClick={onPost} style={{
                flex: 1,
                background: G.green,
                color: G.paper,
                border: 'none',
                borderRadius: 10,
                padding: '10px 0',
                fontFamily: G.sans,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}>
                {getCopy().request.newLabel}
              </button>
            )}
            {onRing && (
              <button onClick={onRing} style={{
                flex: 1,
                background: 'transparent',
                color: G.ink,
                border: `1.5px solid ${G.ink}`,
                borderRadius: 10,
                padding: '10px 0',
                fontFamily: G.sans,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: 0.85,
              }}>
                {getCopy().urgentSignal.actionLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // First-time onboarding checklist. Each step reflects real state:
  //   1. Name your homestead — done once household exists (always true here).
  //   2. Invite your village — done when villageSize > 0.
  //   3. Post your first need — done when the user has posted at least one shift.
  // When all three are done, this whole panel hides (handled by caller).
  const step2Done = villageSize > 0;
  const step3Done = hasPosted;
  return (
    <div style={{ margin: '18px 0' }}>
      <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 22, color: G.ink, lineHeight: 1.2, marginBottom: 4 }}>
        Let&apos;s get set up.
      </div>
      <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted, marginBottom: 16 }}>
        A few steps and your {getCopy().brand.name} is ready.
      </div>
      <OnboardStep
        num={1}
        done={true}
        title={`Name your ${getCopy().brand.name}`}
        sub="Your household has a name. Good start."
      />
      <OnboardStep
        num={2}
        done={step2Done}
        title={`Invite your ${getCopy().circle.title.toLowerCase()}`}
        sub={step2Done
          ? `Circle members added. They can claim ${getCopy().request.tabLabel.toLowerCase()} and answer the ${getCopy().urgentSignal.noun.toLowerCase()}.`
          : `Add a grandparent, sitter, or trusted friend. They can claim ${getCopy().request.tabLabel.toLowerCase()} and answer the ${getCopy().urgentSignal.noun.toLowerCase()}.`}
        action={!step2Done ? (
          <button onClick={onVillage} style={{
            padding: '8px 16px',
            background: G.green, color: G.bg,
            border: 'none', borderRadius: 6,
            fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
            textTransform: 'uppercase', cursor: 'pointer',
          }}>Go to {getCopy().circle.title} →</button>
        ) : undefined}
      />
      <OnboardStep
        num={3}
        done={step3Done}
        title="Post your first need"
        sub={step3Done
          ? "You've posted your first need."
          : `Pick a date, a time, and who it's for. Your ${getCopy().circle.title.toLowerCase()} gets notified instantly.`}
        action={!step3Done ? (
          <button onClick={onPost} disabled={!step2Done} style={{
            padding: '8px 16px',
            background: step2Done ? G.green : G.hairline2,
            color: step2Done ? G.bg : G.muted,
            border: 'none', borderRadius: 6,
            fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
            textTransform: 'uppercase',
            cursor: step2Done ? 'pointer' : 'not-allowed',
          }}>{step2Done ? 'Post a need →' : `Invite ${getCopy().circle.title.toLowerCase()} first`}</button>
        ) : undefined}
      />
    </div>
  );
}

const BellButton = React.memo(function BellButton({ onRing }: { onRing: () => void }) {
  return (
    <button
      onClick={onRing}
      aria-label={`${getCopy().urgentSignal.actionLabel}`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 44, height: 44, borderRadius: 44,
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: 0,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 26,
        background: G.clay, color: G.bg,
        boxShadow: '0 1px 4px rgba(181,52,43,0.35)',
        pointerEvents: 'none',
      }}>
      {/* Lantern icon — matches tab bar and empty-state glyph */}
      <svg width="14" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 2v2" stroke={G.bg} strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M8 4h8" stroke={G.bg} strokeWidth="1.8" strokeLinecap="round"/>
        <rect x="7" y="6" width="10" height="13" rx="2" stroke={G.bg} strokeWidth="1.5"/>
        <path d="M7 10h10" stroke={G.bg} strokeWidth="1" strokeOpacity="0.5"/>
        <ellipse cx="12" cy="14" rx="2.5" ry="3" fill={G.bg} fillOpacity="0.9"/>
        <path d="M9 19h6" stroke={G.bg} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      </div>
    </button>
  );
});

export function ScreenAlmanac({ role = 'parent', isDualRole = false, onRing, onViewBell, onPost, onVillage }: {
  role?: 'parent' | 'caregiver';
  isDualRole?: boolean;
  onRing?: () => void;      // compose mode — new bell
  onViewBell?: () => void;  // status mode — view existing active bell
  onPost?: () => void;
  onVillage?: () => void;
}) {
  const { active, all, rolesByHousehold } = useHousehold();
  const multiHousehold = all.length > 1;
  const [rows, setRows] = useState<ShiftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<ShiftRow | null>(null);
  const [villageSize, setVillageSize] = useState(0);
  const [activeBell, setActiveBell] = useState<ActiveBellData | null>(null);
  const [cancellingBell, setCancellingBell] = useState(false);
  const [unavailability, setUnavailability] = useState<UnavailRow[]>([]);
  const [showUnavailForm, setShowUnavailForm] = useState(false);
  const [unavailDate, setUnavailDate] = useState('');
  const [unavailStartTime, setUnavailStartTime] = useState('09:00');
  const [unavailEndDate, setUnavailEndDate] = useState('');
  const [unavailEndTime, setUnavailEndTime] = useState('17:00');
  const [unavailNote, setUnavailNote] = useState('');
  const [savingUnavail, setSavingUnavail] = useState(false);
  const [unavailError, setUnavailError] = useState<string | null>(null);
  // derived for API
  const unavailStart = unavailDate ? `${unavailDate}T${unavailStartTime}` : '';
  const unavailEnd = unavailEndDate ? `${unavailEndDate}T${unavailEndTime}` : '';

  const load = useCallback(async () => {
    setError(null);
    try {
      // Caregivers always use 'all' so shifts from every household they serve
      // are included — 'village' only fans out via Clerk orgs and can miss
      // households where the user was added directly to the DB without a Clerk invite.
      const scope = (isDualRole || multiHousehold || role === 'caregiver') ? 'all' : 'household';
      const [shiftsRes, villageRes, bellRes] = await Promise.all([
        fetch(`/api/shifts?scope=${scope}`),
        role === 'parent' ? fetch('/api/village') : Promise.resolve(null),
        role === 'parent' ? fetch('/api/bell/active') : Promise.resolve(null),
      ]);
      if (shiftsRes.status === 409 || shiftsRes.status === 401) {
        // No active household yet (Clerk still hydrating, or user has no household).
        // Render empty state, not an error.
        setRows([]);
        return;
      }
      if (!shiftsRes.ok) throw new Error(`Couldn\u2019t load ${getCopy().request.tabLabel.toLowerCase()}`);
      const data = await shiftsRes.json() as { shifts: ShiftRow[] };
      setRows(data.shifts);
      if (villageRes?.ok) {
        const v = await villageRes.json();
        setVillageSize((v.adults?.length ?? 0) + (v.kids?.length ?? 0));
      }
      if (bellRes?.ok) {
        const bd = await bellRes.json();
        // API returns ringing-first, so first entry is most urgent. No client-side status filter needed.
        const bell = (bd.bells || [])[0] as ActiveBellData | undefined;
        setActiveBell(bell ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setRows([]);
    }
  }, [role, isDualRole, multiHousehold]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load, active?.id]);

  // Re-load on focus so the bell banner reappears when parent switches back from
  // another screen or app — without this, the banner only shows on mount.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // Poll every 15s while visible so bell status (ringing → handled) stays live.
  useEffect(() => {
    if (role !== 'parent') return;
    const id = setInterval(() => load(), 15_000);
    return () => clearInterval(id);
  }, [role, load]);

  const loadUnavail = useCallback(async () => {
    if (role !== 'caregiver' && !isDualRole) return;
    try {
      const res = await fetch('/api/unavailability');
      if (res.ok) {
        const data = await res.json();
        setUnavailability(data.unavailability || []);
      }
    } catch { /* ignore */ }
  }, [role, isDualRole]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadUnavail(); }, [loadUnavail]);

  async function saveUnavail() {
    setUnavailError(null);
    if (!unavailStart || !unavailEnd) return;
    // Client-side validation before hitting the server
    const s = new Date(unavailStart);
    const e = new Date(unavailEnd);
    if (e <= s) {
      setUnavailError('End time must be after start time.');
      return;
    }
    setSavingUnavail(true);
    try {
      const res = await fetch('/api/unavailability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startsAt: s.toISOString(), endsAt: e.toISOString(), note: unavailNote || undefined }),
      });
      if (res.ok) {
        setShowUnavailForm(false);
        setUnavailDate(''); setUnavailStartTime('09:00');
        setUnavailEndDate(''); setUnavailEndTime('17:00');
        setUnavailNote('');
        await loadUnavail();
      } else {
        const data = await res.json().catch(() => ({}));
        setUnavailError(data.error || 'Could not save. Try again.');
      }
    } catch {
      setUnavailError('Network error. Try again.');
    } finally {
      setSavingUnavail(false);
    }
  }

  async function deleteUnavail(id: string) {
    await fetch(`/api/unavailability?id=${id}`, { method: 'DELETE' });
    await loadUnavail();
  }

  const cancelShift = useCallback(async (id: string) => {
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
  }, [load]);

  const claimShift = useCallback(async (id: string) => {
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
  }, [load]);

  const myHouseholdId = active?.id;

  const upcoming = useMemo(() => {
    const now = new Date();
    return (rows || []).filter(r => new Date(r.shift.endsAt) >= now && r.shift.status !== 'cancelled');
  }, [rows]);

  // Dual-role split: own household vs other families needing help
  const ownShifts = useMemo(() => isDualRole
    ? upcoming.filter(r => r.shift.householdId === myHouseholdId)
    // Pure caregiver: only open shifts — claimed shifts live on the Schedule screen
    : role === 'caregiver'
      ? upcoming.filter(r => r.shift.status === 'open')
      : upcoming,
  [upcoming, isDualRole, myHouseholdId, role]);

  const helpNeeded = useMemo(() => isDualRole
    ? upcoming.filter(r => r.shift.householdId !== myHouseholdId && r.shift.status === 'open' && !r.claimedByMe)
    : [],
  [upcoming, isDualRole, myHouseholdId]);

  const myCaregiverClaimed = useMemo(() => isDualRole
    ? upcoming.filter(r => r.shift.householdId !== myHouseholdId && r.claimedByMe)
    : [],
  [upcoming, isDualRole, myHouseholdId]);

  const today    = useMemo(() => ownShifts.filter(r => bucketOf(r.shift.startsAt) === 'today'), [ownShifts]);
  const tomorrow = useMemo(() => ownShifts.filter(r => bucketOf(r.shift.startsAt) === 'tomorrow'), [ownShifts]);
  const week     = useMemo(() => ownShifts.filter(r => bucketOf(r.shift.startsAt) === 'week'), [ownShifts]);
  const later    = useMemo(() => ownShifts.filter(r => bucketOf(r.shift.startsAt) === 'later'), [ownShifts]);

  const title = role === 'caregiver' ? getCopy().schedule.caregiverTitle : getCopy().schedule.title;
  // Pretty name of the active household, shown as a subtitle so multi-household
  // users (Karson) can see which family they're looking at without opening the switcher.
  const activeHouseholdLabel = active?.name
    ? active.name.replace(/\s+(household|family|home|house)s?$/i, '')
    : null;

  const tagline = useMemo(() => {
    let statusLine = 'Loading…';
    if (rows !== null) {
      if (isDualRole) {
        const openInHousehold = ownShifts.filter(r => r.shift.status === 'open').length;
        const parts = [
          openInHousehold > 0 ? `${openInHousehold} open in your household` : null,
          myCaregiverClaimed.length > 0 ? `${myCaregiverClaimed.length} you're covering` : null,
          helpNeeded.length > 0 ? `${helpNeeded.length} available to help with` : null,
        ].filter(Boolean);
        statusLine = parts.length ? parts.join(' · ') : 'All covered.';
      } else if (upcoming.length === 0) {
        statusLine = 'Nothing on the books yet.';
      } else if (multiHousehold) {
        statusLine = `${upcoming.filter(r => r.shift.status === 'open').length} open · ${upcoming.filter(r => r.claimedByMe).length} you're covering.`;
      } else if (role === 'parent') {
        statusLine = `${upcoming.filter(r => r.shift.status === 'claimed').length} claimed · ${upcoming.filter(r => r.shift.status === 'open').length} still open.`;
      } else {
        const openCount = upcoming.filter(r => r.shift.status === 'open').length;
        statusLine = openCount > 0 ? `${openCount} open` : 'Nothing open right now.';
      }
    }
    return activeHouseholdLabel ? `${activeHouseholdLabel} · ${statusLine}` : statusLine;
  }, [rows, isDualRole, ownShifts, myCaregiverClaimed, helpNeeded, upcoming, multiHousehold, role, activeHouseholdLabel]);

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: G.bg, color: G.ink }}>
      <GMasthead
        leftAction={<HouseholdSwitcher />}
        rightAction={role === 'parent' && onRing ? <BellButton onRing={onRing} /> : undefined}
        right={fmtDateShort(new Date())}
        title={title}
        tagline={tagline}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 100px' }}>
        {/* Active lantern card — parent only */}
        {role === 'parent' && activeBell && (
          <LanternCard
            bell={activeBell}
            onView={onViewBell ?? (() => {})}
            onCancel={async () => {
              if (cancellingBell) return;
              setCancellingBell(true);
              try {
                const res = await fetch(`/api/bell/${activeBell.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'cancelled' }),
                });
                if (res.ok) setActiveBell(null);
              } finally {
                setCancellingBell(false);
              }
            }}
            cancelling={cancellingBell}
          />
        )}
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
          <EmptyAlmanac
            onRing={onRing} onPost={onPost} onVillage={onVillage}
            role={role}
            villageSize={villageSize}
            hasPosted={(rows?.length ?? 0) > 0}
          />
        )}

        {today.length > 0 && <>
          <SectionHead label="Today" />
          {today.map(r => (
            <ShiftCard
              key={r.shift.id} row={r}
              accent={r.shift.status === 'claimed' ? G.green : G.clay}
              tagline={r.shift.status === 'claimed'
  ? (role === 'caregiver'
      ? (r.claimedByMe ? 'Claimed by you' : 'Covered')
      : (r.claimer ? `Claimed · ${shortName(r.claimer.name)}` : 'Covered'))
  : 'Open · needs someone'}
              onCancel={role === 'parent' && r.createdByMe ? cancelShift : undefined}
              cancelling={cancellingId === r.shift.id}
              onClaim={r.shift.status === 'open' && (role === 'caregiver' || !r.createdByMe) ? claimShift : undefined}
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
              tagline={r.shift.status === 'claimed'
  ? (role === 'caregiver'
      ? (r.claimedByMe ? 'Claimed by you' : 'Covered')
      : (r.claimer ? `Claimed · ${shortName(r.claimer.name)}` : 'Covered'))
  : 'Open · needs someone'}
              onCancel={role === 'parent' && r.createdByMe ? cancelShift : undefined}
              cancelling={cancellingId === r.shift.id}
              onClaim={r.shift.status === 'open' && (role === 'caregiver' || !r.createdByMe) ? claimShift : undefined}
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
              const label = fmtDateShort(first);
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
                      tagline={r.shift.status === 'claimed'
  ? (role === 'caregiver'
      ? (r.claimedByMe ? 'Claimed by you' : 'Covered')
      : (r.claimer ? `Claimed · ${shortName(r.claimer.name)}` : 'Covered'))
  : 'Open · needs someone'}
                      onCancel={role === 'parent' && r.createdByMe ? cancelShift : undefined}
                      cancelling={cancellingId === r.shift.id}
                      onClaim={r.shift.status === 'open' && (role === 'caregiver' || !r.createdByMe) ? claimShift : undefined}
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
              tagline={r.shift.status === 'claimed'
  ? (role === 'caregiver'
      ? (r.claimedByMe ? 'Claimed by you' : 'Covered')
      : (r.claimer ? `Claimed · ${shortName(r.claimer.name)}` : 'Covered'))
  : 'Open · needs someone'}
              onCancel={role === 'parent' && r.createdByMe ? cancelShift : undefined}
              cancelling={cancellingId === r.shift.id}
              onClaim={r.shift.status === 'open' && (role === 'caregiver' || !r.createdByMe) ? claimShift : undefined}
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
                Open requests from other families in your circle
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

        {/* ── Not Available section (caregiver only) ── */}
        {(role === 'caregiver' || isDualRole) && (
          <div style={{ marginTop: 28, paddingTop: 18, borderTop: `1px solid ${G.hairline2}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <GLabel>Not Available</GLabel>
                <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted, marginTop: 2 }}>
                  Block time so families know not to expect you.
                </div>
              </div>
              <button onClick={() => setShowUnavailForm(v => !v)} style={{
                background: 'transparent', border: `1px solid ${G.hairline2}`, borderRadius: 100,
                padding: '5px 12px', cursor: 'pointer',
                fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
                textTransform: 'uppercase', color: G.ink,
              }}>{showUnavailForm ? 'Cancel' : '+ Add'}</button>
            </div>

            {showUnavailForm && (
              <div style={{
                padding: 14, borderRadius: 8, border: `1px solid ${G.hairline2}`,
                background: G.paper, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <WhenPickerDateRange
                  startDate={unavailDate}
                  endDate={unavailEndDate}
                  startTime={unavailStartTime}
                  endTime={unavailEndTime}
                  onChange={v => {
                    setUnavailDate(v.startDate);
                    setUnavailEndDate(v.endDate);
                    setUnavailStartTime(v.startTime);
                    setUnavailEndTime(v.endTime);
                  }}
                  presets={unavailRangePresets}
                />
                <input value={unavailNote} onChange={e => setUnavailNote(e.target.value)}
                  placeholder="Optional note (vacation, work trip…)"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${G.hairline2}`, borderRadius: 6, background: G.bg, fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.ink, outline: 'none' }} />
                <button onClick={saveUnavail} disabled={savingUnavail || !unavailStart || !unavailEnd} style={{
                  padding: '10px', background: G.ink, color: G.bg, border: 'none', borderRadius: 6,
                  fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase',
                  cursor: (savingUnavail || !unavailStart || !unavailEnd) ? 'not-allowed' : 'pointer',
                  opacity: (savingUnavail || !unavailStart || !unavailEnd) ? 0.5 : 1,
                }}>{savingUnavail ? 'Saving…' : 'Block this time'}</button>
                {unavailError && (
                  <div style={{ padding: '8px 10px', borderRadius: 6, background: '#FFE6DA', fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: '#7A2F12' }}>
                    {unavailError}
                  </div>
                )}
              </div>
            )}

            {unavailability.length === 0 && !showUnavailForm && (
              <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted }}>
                No blocked times — you&rsquo;re wide open.
              </div>
            )}

            {unavailability.map(u => {
              const s = new Date(u.startsAt);
              const e = new Date(u.endsAt);
              const fmt = (d: Date) => fmtDateMonthDay(d) + ' ' + fmtTimeOnly(d);
              return (
                <div key={u.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: 8, background: G.paper,
                  border: `1px solid ${G.hairline2}`, marginBottom: 8,
                }}>
                  <div>
                    <div style={{ fontFamily: G.sans, fontSize: 12, fontWeight: 600, color: G.ink }}>
                      {fmt(s)} – {fmt(e)}
                    </div>
                    {u.note && <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 11, color: G.muted, marginTop: 2 }}>{u.note}</div>}
                  </div>
                  <button
                    onClick={() => deleteUnavail(u.id)}
                    aria-label="Remove"
                    style={{
                      flexShrink: 0,
                      background: 'transparent', border: `1px solid ${G.hairline2}`,
                      borderRadius: 6, color: G.muted,
                      fontSize: 16, cursor: 'pointer',
                      padding: '6px 10px', lineHeight: 1,
                      minWidth: 44, minHeight: 44,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >×</button>
                </div>
              );
            })}
          </div>
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
          canClaim={openRow.shift.status === 'open' && (role === 'caregiver' || !openRow.createdByMe)}
        />
      )}
    </div>
  );
}
