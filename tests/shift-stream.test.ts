// Regression tests for fix/realtime-perch (SSE stream for live shift updates)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const streamRoute = readFileSync(join(__dirname, '../app/api/whistles/stream/route.ts'), 'utf-8');
const contextSrc = readFileSync(join(__dirname, '../app/context/AppDataContext.tsx'), 'utf-8');
const almanacSrc = readFileSync(join(__dirname, '../app/components/ScreenPerch.tsx'), 'utf-8');

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

  it('defines MAX_CONNECTION_MS less than maxDuration * 1000 to self-terminate before Vercel kill', () => {
    // Prevents "Vercel Runtime Timeout Error: Task timed out after 300 seconds" noise
    const match = streamRoute.match(/MAX_CONNECTION_MS\s*=\s*([\d_]+)/);
    expect(match).not.toBeNull();
    const maxConn = parseInt(match![1].replace(/_/g, ''), 10);
    expect(maxConn).toBeLessThan(300_000);
    expect(maxConn).toBeGreaterThan(60_000); // at least 1 minute of live data
  });

  it('emits a reconnect event before self-terminating', () => {
    expect(streamRoute).toContain("event: reconnect");
    expect(streamRoute).toContain('MAX_CONNECTION_MS');
  });
});

describe('AppDataContext SSE wiring', () => {
  it('exports enableWhistleStream from context type', () => {
    expect(contextSrc).toContain('enableWhistleStream: (on: boolean) => void');
  });

  it('opens EventSource to /api/whistles/stream', () => {
    expect(contextSrc).toContain("new EventSource('/api/whistles/stream')");
  });

  it('updates both village and all scopes on stream message', () => {
    expect(contextSrc).toContain("village: rows, all: rows");
  });

  it('reconnects after error with active guard to prevent ghost reconnects', () => {
    expect(contextSrc).toContain('if (active) connect()');
  });

  it('handles reconnect event with immediate reconnect (no delay)', () => {
    // Server self-terminates cleanly — no need to wait 5s like on error
    expect(contextSrc).toContain("addEventListener('reconnect'");
    // reconnect handler should call connect() without a setTimeout delay
    const reconnectBlock = contextSrc.slice(contextSrc.indexOf("addEventListener('reconnect'"));
    const firstBrace = reconnectBlock.indexOf('{');
    const closingBrace = reconnectBlock.indexOf('});', firstBrace);
    const handlerBody = reconnectBlock.slice(firstBrace, closingBrace);
    expect(handlerBody).not.toContain('setTimeout');
  });
});

describe('ScreenPerch stream integration', () => {
  it('enables stream on mount and disables on unmount', () => {
    expect(almanacSrc).toContain('enableWhistleStream(true)');
    expect(almanacSrc).toContain('enableWhistleStream(false)');
  });

  it('reads from whistles[all] and filters by household for single-household parents', () => {
    expect(almanacSrc).toContain("scope === 'household' && streamAll !== null");
    expect(almanacSrc).toContain('r.shift.householdId === active?.id');
  });

  it('always loads all scope on mount so stream has initial data', () => {
    expect(almanacSrc).toContain("refreshWhistles('all')");
  });
});
