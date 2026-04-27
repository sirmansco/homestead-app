'use client';
import React, { useState, useMemo, CSSProperties } from 'react';
import { fmtDateShort } from '@/lib/format/time';
import { G } from './tokens';

// ── Helpers ───────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalDT(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function toLocalDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function toLocalTime(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function setHM(d: Date, h: number, m = 0) { const x = new Date(d); x.setHours(h, m, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addHours(d: Date, n: number) { return new Date(d.getTime() + n * 3600000); }

// Format a datetime-local value for human display ("Today 2:30pm", "Sat Apr 25 9:00am")
export function formatWhen(value: string, kind: 'datetime' | 'date' | 'time' = 'datetime'): string {
  if (!value) return '';
  if (kind === 'time') {
    const [h, m] = value.split(':').map(Number);
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${pad(m)}${ampm}`;
  }
  const d = kind === 'date' ? new Date(value + 'T00:00') : new Date(value);
  if (isNaN(+d)) return '';
  const today = startOfDay();
  const tomorrow = addDays(today, 1);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const dayLabel = sameDay(d, today) ? 'Today' : sameDay(d, addDays(today, -1)) ? 'Yesterday' : sameDay(d, tomorrow) ? 'Tomorrow' : fmtDateShort(d);
  if (kind === 'date') return dayLabel;
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${dayLabel} ${h12}:${pad(m)}${ampm}`;
}

// ── Preset types ──────────────────────────────────────────────────────────
export type MomentPreset = { id: string; label: string; build: (now: Date) => Date };
export type WindowPreset = { id: string; label: string; build: (now: Date) => { start: Date; end: Date } };
export type DateRangePreset = { id: string; label: string; build: (now: Date) => { start: Date; end: Date } };

// ── Preset libraries ──────────────────────────────────────────────────────
export const bellWindowPresets: WindowPreset[] = [
  { id: 'now-1h',  label: '1 hour',         build: now => ({ start: now, end: addHours(now, 1) }) },
  { id: 'now-3h',  label: '3 hours',        build: now => ({ start: now, end: addHours(now, 3) }) },
  { id: 'now-eod', label: 'Rest of day',    build: now => ({ start: now, end: setHM(now, 23, 59) }) },
];

export const shiftWindowPresets: WindowPreset[] = [
  { id: 'today-morning',    label: 'Today · morning',    build: now => ({ start: setHM(now, 8),  end: setHM(now, 12) }) },
  { id: 'today-afternoon',  label: 'Today · afternoon',  build: now => ({ start: setHM(now, 13), end: setHM(now, 17) }) },
  { id: 'today-evening',    label: 'Today · evening',    build: now => ({ start: setHM(now, 17), end: setHM(now, 21) }) },
  { id: 'tom-morning',      label: 'Tomorrow · morning', build: now => { const t = addDays(now, 1); return { start: setHM(t, 8), end: setHM(t, 12) }; } },
  { id: 'tom-afternoon',    label: 'Tomorrow · afternoon', build: now => { const t = addDays(now, 1); return { start: setHM(t, 13), end: setHM(t, 17) }; } },
  { id: 'tom-evening',      label: 'Tomorrow · evening', build: now => { const t = addDays(now, 1); return { start: setHM(t, 17), end: setHM(t, 21) }; } },
];

export const unavailRangePresets: DateRangePreset[] = [
  { id: 'today',    label: 'Today',    build: now => ({ start: startOfDay(now), end: startOfDay(now) }) },
  { id: 'tomorrow', label: 'Tomorrow', build: now => { const t = addDays(now, 1); return { start: t, end: t }; } },
  { id: 'this-wk',  label: 'Rest of this week', build: now => ({ start: startOfDay(now), end: addDays(startOfDay(now), 6 - now.getDay()) }) },
  { id: 'next-wk',  label: 'Next week', build: now => { const start = addDays(startOfDay(now), 7 - now.getDay()); return { start, end: addDays(start, 6) }; } },
];

export const datePresets: { id: string; label: string; build: (now: Date) => Date }[] = [
  { id: 'today',    label: 'Today',    build: now => startOfDay(now) },
  { id: 'tomorrow', label: 'Tomorrow', build: now => addDays(startOfDay(now), 1) },
  { id: 'next-wk',  label: 'Next week', build: now => addDays(startOfDay(now), 7) },
  { id: 'next-mo',  label: 'Next month', build: now => { const x = startOfDay(now); x.setMonth(x.getMonth() + 1); return x; } },
];

// ── Chip ──────────────────────────────────────────────────────────────────
function Chip({ label, active, onClick, accent }: { label: string; active: boolean; onClick: () => void; accent?: string }) {
  const ink = accent || G.ink;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '7px 12px', borderRadius: 999,
        border: `1px solid ${active ? ink : G.hairline2}`,
        background: active ? (accent ? '#FFE6DA' : G.ink) : G.paper,
        color: active ? (accent ? ink : '#FBF7F0') : G.ink,
        fontFamily: G.sans, fontSize: 12, fontWeight: 600, letterSpacing: 0.2,
        cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.1,
      }}
    >{label}</button>
  );
}

// ── WhenPicker — Window mode (start + end datetime) ───────────────────────
// Custom picker uses two-step: date first, then start/end time — no datetime-local.
export function WhenPickerWindow({
  startValue, endValue, onChange, presets, accent, minNow, label,
}: {
  startValue: string;
  endValue: string;
  onChange: (start: string, end: string) => void;
  presets: WindowPreset[];
  accent?: string;
  minNow?: string;
  label?: string;
}) {
  const [showCustom, setShowCustom] = useState(false);

  const matchedPreset = useMemo(() => {
    if (!startValue || !endValue) return null;
    const now = new Date();
    return presets.find(p => {
      const r = p.build(now);
      return Math.abs(new Date(startValue).getTime() - r.start.getTime()) < 60000
          && Math.abs(new Date(endValue).getTime() - r.end.getTime()) < 60000;
    })?.id || null;
  }, [startValue, endValue, presets]);

  const apply = (preset: WindowPreset) => {
    const now = new Date();
    const r = preset.build(now);
    onChange(toLocalDT(r.start), toLocalDT(r.end));
    setShowCustom(false);
  };

  // Derived date/time parts from the composite datetime-local strings
  const dateVal = startValue ? startValue.slice(0, 10) : '';
  const startTimeVal = startValue ? startValue.slice(11, 16) : '';
  const endTimeVal = endValue ? endValue.slice(11, 16) : '';
  const minDate = minNow ? minNow.slice(0, 10) : '';

  const handleDate = (d: string) => {
    const st = startTimeVal || '09:00';
    const et = endTimeVal || '12:00';
    const next = `${d}T${st}`;
    let nextEnd = `${d}T${et}`;
    if (nextEnd <= next) {
      nextEnd = toLocalDT(addHours(new Date(next), 3));
    }
    onChange(next, nextEnd);
  };

  const handleStartTime = (t: string) => {
    const d = dateVal || toLocalDate(new Date());
    const next = `${d}T${t}`;
    let nextEnd = endValue;
    if (!nextEnd || nextEnd <= next) {
      nextEnd = toLocalDT(addHours(new Date(next), 3));
    }
    onChange(next, nextEnd);
  };

  const handleEndTime = (t: string) => {
    const d = dateVal || toLocalDate(new Date());
    onChange(startValue, `${d}T${t}`);
  };

  return (
    <div>
      {label && <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: accent || G.ink, fontWeight: 700, marginBottom: 8 }}>{label}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {presets.map(p => (
          <Chip key={p.id} label={p.label} active={matchedPreset === p.id && !showCustom} onClick={() => apply(p)} accent={accent} />
        ))}
        <Chip label={showCustom ? 'Hide custom' : 'Custom…'} active={showCustom || (!matchedPreset && !!startValue)} onClick={() => setShowCustom(s => !s)} accent={accent} />
      </div>
      {(showCustom || (!matchedPreset && !!startValue)) && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label>
            <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: accent || G.muted, fontWeight: 700, marginBottom: 4 }}>Date</div>
            <input
              type="date"
              value={dateVal}
              min={minDate}
              onChange={e => handleDate(e.target.value)}
              style={inputStyle(accent)}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label>
              <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: accent || G.muted, fontWeight: 700, marginBottom: 4 }}>Start</div>
              <input
                type="time"
                value={startTimeVal}
                onChange={e => handleStartTime(e.target.value)}
                style={inputStyle(accent)}
              />
            </label>
            <label>
              <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: G.muted, fontWeight: 700, marginBottom: 4 }}>Until</div>
              <input
                type="time"
                value={endTimeVal}
                onChange={e => handleEndTime(e.target.value)}
                style={inputStyle()}
              />
            </label>
          </div>
        </div>
      )}
      {!showCustom && matchedPreset && (
        <div style={{ marginTop: 8, fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted }}>
          {formatWhen(startValue)} → {formatWhen(endValue)}
        </div>
      )}
    </div>
  );
}

// ── WhenPicker — Date mode (single date) ──────────────────────────────────
export function WhenPickerDate({
  value, onChange, presets, label, minDate,
}: {
  value: string;
  onChange: (date: string) => void;
  presets: { id: string; label: string; build: (now: Date) => Date }[];
  label?: string;
  minDate?: string;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const matched = useMemo(() => {
    if (!value) return null;
    const now = new Date();
    return presets.find(p => toLocalDate(p.build(now)) === value)?.id || null;
  }, [value, presets]);
  const apply = (p: typeof presets[number]) => {
    onChange(toLocalDate(p.build(new Date())));
    setShowCustom(false);
  };
  return (
    <div>
      {label && <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: G.ink, fontWeight: 700, marginBottom: 8 }}>{label}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {presets.map(p => (
          <Chip key={p.id} label={p.label} active={matched === p.id && !showCustom} onClick={() => apply(p)} />
        ))}
        <Chip label={showCustom ? 'Hide' : 'Pick date…'} active={showCustom || (!matched && !!value)} onClick={() => setShowCustom(s => !s)} />
      </div>
      {(showCustom || (!matched && !!value)) && (
        <input
          type="date"
          value={value}
          min={minDate}
          onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle(), marginTop: 10, fontSize: 16 }}
        />
      )}
      {!showCustom && matched && value && (
        <div style={{ marginTop: 8, fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted }}>
          {formatWhen(value, 'date')}
        </div>
      )}
    </div>
  );
}

// ── WhenPicker — DateRange + Time mode (Almanac unavailable) ──────────────
export function WhenPickerDateRange({
  startDate, endDate, startTime, endTime,
  onChange, presets, label,
}: {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  onChange: (v: { startDate: string; endDate: string; startTime: string; endTime: string }) => void;
  presets: DateRangePreset[];
  label?: string;
}) {
  const [showCustom, setShowCustom] = useState(false);

  const matched = useMemo(() => {
    if (!startDate || !endDate) return null;
    const now = new Date();
    return presets.find(p => {
      const r = p.build(now);
      return toLocalDate(r.start) === startDate && toLocalDate(r.end) === endDate;
    })?.id || null;
  }, [startDate, endDate, presets]);

  const apply = (p: DateRangePreset) => {
    const r = p.build(new Date());
    onChange({
      startDate: toLocalDate(r.start),
      endDate: toLocalDate(r.end),
      startTime: startTime || '09:00',
      endTime: endTime || '17:00',
    });
    setShowCustom(false);
  };

  return (
    <div>
      {label && <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: G.ink, fontWeight: 700, marginBottom: 8 }}>{label}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {presets.map(p => (
          <Chip key={p.id} label={p.label} active={matched === p.id && !showCustom} onClick={() => apply(p)} />
        ))}
        <Chip label={showCustom ? 'Hide' : 'Custom…'} active={showCustom || (!matched && !!startDate)} onClick={() => setShowCustom(s => !s)} />
      </div>

      {(showCustom || (!matched && !!startDate)) && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: G.muted, fontWeight: 700, marginBottom: 4 }}>From</div>
            <input
              type="date"
              value={startDate}
              min={toLocalDate(new Date())}
              onChange={e => {
                const v = e.target.value;
                onChange({ startDate: v, endDate: endDate < v ? v : endDate, startTime, endTime });
              }}
              style={inputStyle()}
            />
            <input
              type="time"
              value={startTime}
              onChange={e => onChange({ startDate, endDate, startTime: e.target.value, endTime })}
              style={{ ...inputStyle(), marginTop: 6 }}
            />
          </div>
          <div>
            <div style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: G.muted, fontWeight: 700, marginBottom: 4 }}>Until</div>
            <input
              type="date"
              value={endDate}
              min={startDate || toLocalDate(new Date())}
              onChange={e => onChange({ startDate, endDate: e.target.value, startTime, endTime })}
              style={inputStyle()}
            />
            <input
              type="time"
              value={endTime}
              onChange={e => onChange({ startDate, endDate, startTime, endTime: e.target.value })}
              style={{ ...inputStyle(), marginTop: 6 }}
            />
          </div>
        </div>
      )}

      {!showCustom && matched && (
        <div style={{ marginTop: 8, fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted }}>
          {formatWhen(startDate, 'date')}
          {startDate !== endDate && ` → ${formatWhen(endDate, 'date')}`}
          {` · ${formatWhen(startTime, 'time')}–${formatWhen(endTime, 'time')}`}
        </div>
      )}
    </div>
  );
}

function inputStyle(accent?: string): CSSProperties {
  return {
    display: 'block', width: '100%', padding: '8px 10px', borderRadius: 8, boxSizing: 'border-box',
    border: `1px solid ${accent || G.hairline2}`, background: accent ? '#FFE6DA' : G.paper,
    fontFamily: G.display, fontSize: 16, color: G.ink, outline: 'none', minWidth: 0,
  };
}
