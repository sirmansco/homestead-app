// Regression tests for fix/realtime-perch (SSE stream for live shift updates)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const streamRoute = readFileSync(join(__dirname, '../app/api/shifts/stream/route.ts'), 'utf-8');
const contextSrc = readFileSync(join(__dirname, '../app/context/AppDataContext.tsx'), 'utf-8');
const almanacSrc = readFileSync(join(__dirname, '../app/components/ScreenAlmanac.tsx'), 'utf-8');

describe('SSE stream route', () => {
  it('exports maxDuration = 300 for Vercel Pro streaming', () => {
    expect(streamRoute).toContain('export const maxDuration = 300');
  });

  it('forces dynamic rendering (no static cache)', () => {
    expect(streamRoute).toContain("export const dynamic = 'force-dynamic'");
  });

  it('sends a keepalive ping on unchanged polls', () => {
    expect(streamRoute).toContain(': ping');
  });

  it('sends an error event on poll failure so the client can reconnect', () => {
    expect(streamRoute).toContain("event: error");
  });

  it('returns text/event-stream content type', () => {
    expect(streamRoute).toContain("'text/event-stream'");
  });
});

describe('AppDataContext SSE wiring', () => {
  it('exports enableShiftStream from context type', () => {
    expect(contextSrc).toContain('enableShiftStream: (on: boolean) => void');
  });

  it('opens EventSource to /api/shifts/stream', () => {
    expect(contextSrc).toContain("new EventSource('/api/shifts/stream')");
  });

  it('updates both village and all scopes on stream message', () => {
    expect(contextSrc).toContain("village: rows, all: rows");
  });

  it('reconnects after error with active guard to prevent ghost reconnects', () => {
    expect(contextSrc).toContain('if (active) connect()');
  });
});

describe('ScreenAlmanac stream integration', () => {
  it('enables stream on mount and disables on unmount', () => {
    expect(almanacSrc).toContain('enableShiftStream(true)');
    expect(almanacSrc).toContain('enableShiftStream(false)');
  });

  it('reads from shifts[all] and filters by household for single-household parents', () => {
    expect(almanacSrc).toContain("scope === 'household' && streamAll !== null");
    expect(almanacSrc).toContain('r.shift.householdId === active?.id');
  });

  it('always loads all scope on mount so stream has initial data', () => {
    expect(almanacSrc).toContain("refreshShifts('all')");
  });
});
