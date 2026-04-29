'use client';
import React from 'react';
import { G } from './tokens';
import { GMasthead, GLabel } from './shared';
import { HouseholdSwitcher } from './HouseholdSwitcher';

function SectionHead2({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 10px' }}>
      <div style={{ width: 24, height: 1, background: G.ink }} />
      <GLabel color={G.ink}>{label}</GLabel>
      <div style={{ flex: 1, height: 1, background: G.hairline }} />
    </div>
  );
}

function RecurringBlock({ days, time, label }: { days: string[]; time: string; label: string }) {
  const allDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const fullNames = ['M', 'T', 'W', 'T', 'F', 'Sat', 'Sun'];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', marginBottom: 6,
      background: G.paper, border: `1px solid ${G.hairline}`, borderRadius: 8,
    }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {allDays.map((d, i) => {
          const on = days.includes(d) || days.includes(fullNames[i]);
          return (
            <div key={i} style={{
              width: 18, height: 18, borderRadius: 3,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: on ? G.ink : 'transparent',
              color: on ? '#FBF7F0' : G.muted,
              border: `1px solid ${on ? G.ink : G.hairline2}`,
              fontFamily: G.sans, fontSize: 9, fontWeight: 700,
            }}>{d}</div>
          );
        })}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: G.display, fontSize: 14, fontWeight: 500, lineHeight: 1.15 }}>{label}</div>
        <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 11, color: G.muted }}>{time}</div>
      </div>
      <div style={{ fontFamily: G.sans, fontSize: 16, color: G.muted }}>›</div>
    </div>
  );
}

function OneOff({ date, time, label }: { date: string; time: string; label: string }) {
  return (
    <div style={{
      padding: '12px 14px', marginBottom: 6,
      background: G.paper, border: `1px solid ${G.hairline}`, borderRadius: 8,
      borderLeft: `3px solid ${G.clay}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <GLabel color={G.clay}>{date}</GLabel>
        <span style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 11, color: G.muted }}>{time}</span>
      </div>
      <div style={{ fontFamily: G.display, fontSize: 15, fontWeight: 500, marginTop: 4 }}>{label}</div>
    </div>
  );
}

export function ScreenTimeOff() {
  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: G.bg, color: G.ink }}>
      <GMasthead
        leftAction={<HouseholdSwitcher />} right="Your availability"
        title="Time Off"
        tagline="You're available by default. Block out the times you can't help — family keeps seeing everything else."
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 100px' }}>
        <SectionHead2 label="Every Week" />
        <RecurringBlock days={['M', 'T', 'W', 'T', 'F']} time="9:00 AM – 5:00 PM" label="Work (office)" />
        <RecurringBlock days={['Sun']} time="All day" label="Church + family" />
        <RecurringBlock days={['W']} time="6:00 – 8:00 PM" label="Choir practice" />

        <button style={{
          width: '100%', padding: '11px 14px', marginTop: 4,
          background: 'transparent', color: G.ink2,
          border: `1px dashed ${G.hairline2}`, borderRadius: 8,
          fontFamily: G.sans, fontSize: 11, fontWeight: 500, letterSpacing: 0.5, cursor: 'pointer',
        }}>+ Add a recurring block</button>

        <SectionHead2 label="One-Offs" />
        <OneOff date="Sat · Oct 19" time="All day" label="Wedding in Seattle" />
        <OneOff date="Nov 22 – 28" time="Full week" label="Thanksgiving in Ohio" />

        <button style={{
          width: '100%', padding: '11px 14px', marginTop: 4,
          background: 'transparent', color: G.ink2,
          border: `1px dashed ${G.hairline2}`, borderRadius: 8,
          fontFamily: G.sans, fontSize: 11, fontWeight: 500, letterSpacing: 0.5, cursor: 'pointer',
        }}>+ Block a specific date</button>

        <SectionHead2 label="Preview · This Week" />
        <div style={{ background: G.paper, border: `1px solid ${G.hairline2}`, borderRadius: 8, padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '36px repeat(7, 1fr)', gap: 2, fontSize: 9, fontFamily: G.sans, fontWeight: 700, letterSpacing: 1, color: G.muted }}>
            <div />
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} style={{ textAlign: 'center', paddingBottom: 4 }}>{d}</div>
            ))}
          </div>
          {['6a', '9a', '12p', '3p', '6p', '9p'].map((hr, ri) => (
            <div key={hr} style={{ display: 'grid', gridTemplateColumns: '36px repeat(7, 1fr)', gap: 2, marginTop: 2 }}>
              <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 10, color: G.muted, paddingRight: 6, textAlign: 'right', paddingTop: 1 }}>{hr}</div>
              {[0, 1, 2, 3, 4, 5, 6].map(di => {
                const blocked =
                  (di < 5 && (ri === 1 || ri === 2 || ri === 3)) ||
                  (di === 2 && ri === 4) ||
                  (di === 5);
                return (
                  <div key={di} style={{
                    height: 14,
                    background: blocked
                      ? `repeating-linear-gradient(135deg, ${G.ink} 0 2px, transparent 2px 5px)`
                      : G.greenSoft,
                    border: `1px solid ${blocked ? G.hairline2 : G.green}`,
                    opacity: blocked ? 0.75 : 0.6,
                  }} />
                );
              })}
            </div>
          ))}
          <div style={{
            display: 'flex', gap: 16, marginTop: 10, paddingTop: 8,
            borderTop: `1px solid ${G.hairline}`,
            fontFamily: G.sans, fontSize: 9, color: G.ink2, fontWeight: 500,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 8, display: 'inline-block', background: G.greenSoft, border: `1px solid ${G.green}` }} />
              OPEN
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 12, height: 8, display: 'inline-block',
                background: `repeating-linear-gradient(135deg, ${G.ink} 0 2px, transparent 2px 5px)`,
                border: `1px solid ${G.hairline2}`,
              }} />
              BLOCKED
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
