'use client';
import React, { useState, useEffect } from 'react';
import { G } from './tokens';
import { GMasthead, GLabel } from './shared';

type DiagResult = {
  db: { ok: boolean; rowCounts: Record<string, number> };
  env: Record<string, boolean>;
  appSha: string | null;
};

export function ScreenDiagnostics({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<DiagResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/diagnostics')
      .then(r => r.ok ? r.json() : r.json().then((d: { error?: string }) => { throw new Error(d.error ?? `${r.status}`); }))
      .then((d: DiagResult) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: G.bg, color: G.ink }}>
      <GMasthead
        leftAction={
          <button onClick={onBack} style={{ fontFamily: G.display, fontSize: 26, color: G.ink, lineHeight: 1, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>×</button>
        }
        title="Diagnostics"
        tagline="Dev-only system snapshot."
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 100px' }}>
        {loading && (
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted, marginTop: 16 }}>
            Loading…
          </div>
        )}

        {error && (
          <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8, background: G.claySoft, border: `1px solid ${G.clay}` }}>
            <div style={{ fontFamily: G.display, fontSize: 14, color: G.clay, fontWeight: 500 }}>Error</div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: G.ink, marginTop: 4 }}>{error}</div>
          </div>
        )}

        {data && (
          <>
            {/* DB */}
            <div style={{ marginBottom: 24 }}>
              <GLabel>Database</GLabel>
              <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 8, background: data.db.ok ? G.greenSoft : G.claySoft, border: `1px solid ${data.db.ok ? G.green : G.clay}` }}>
                <div style={{ fontFamily: G.display, fontSize: 14, fontWeight: 500, color: data.db.ok ? G.green : G.clay }}>
                  {data.db.ok ? 'Connected' : 'Unreachable'}
                </div>
              </div>
              {data.db.ok && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {Object.entries(data.db.rowCounts).map(([table, count]) => (
                    <div key={table} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${G.hairline}` }}>
                      <span style={{ fontFamily: G.sans, fontSize: 13, color: G.ink }}>{table}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, color: G.ink2 }}>{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Env vars */}
            <div style={{ marginBottom: 24 }}>
              <GLabel>Environment</GLabel>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 0 }}>
                {Object.entries(data.env).map(([key, present]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${G.hairline}` }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: G.ink, flexShrink: 0, marginRight: 8 }}>{key}</span>
                    <span style={{ fontFamily: G.sans, fontSize: 11, fontWeight: 700, color: present ? G.green : G.clay }}>
                      {present ? 'set' : 'missing'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* App SHA */}
            <div style={{ marginBottom: 24 }}>
              <GLabel>Build</GLabel>
              <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: G.ink2 }}>
                {data.appSha ?? 'dev'}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
