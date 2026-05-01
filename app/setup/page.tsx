'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { G } from '../components/tokens';
import { getCopy } from '@/lib/copy';

const GLYPHS = ['🏡', '🌾', '🌲', '🏔️', '🌻', '🪺', '🍎', '🐓', '🫐', '🌵', '🦌', '🌊'];

export default function SetupPage() {
  const router = useRouter();
  const t = getCopy();
  const [name, setName] = useState('');
  const [glyph, setGlyph] = useState('🏡');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/household')
      .then(r => r.json())
      .then(d => {
        if (d.household) setName(d.household.name || '');
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const res = await fetch('/api/household', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), glyph }),
    });
    if (res.ok) {
      router.push('/');
    } else {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div style={{
      minHeight: '100vh', background: G.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ maxWidth: 420, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{glyph}</div>
          <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 28, color: G.ink, lineHeight: 1.1 }}>
            Name your {t.brand.name.toLowerCase()}
          </div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 14, color: G.muted, marginTop: 6 }}>
            This is how caregivers will see it.
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: G.sans, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: G.muted, marginBottom: 6 }}>
            Household name
          </div>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            style={{
              width: '100%', padding: '12px 14px',
              background: '#fff', border: `1px solid ${G.hairline2}`,
              borderRadius: 8, fontFamily: G.sans, fontSize: 15, color: G.ink,
            }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: G.sans, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: G.muted, marginBottom: 8 }}>
            Pick a glyph
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {GLYPHS.map(g => (
              <button
                key={g}
                onClick={() => setGlyph(g)}
                style={{
                  aspectRatio: '1', fontSize: 24,
                  background: glyph === g ? G.ink : '#fff',
                  border: `1px solid ${glyph === g ? G.ink : G.hairline2}`,
                  borderRadius: 8, cursor: 'pointer',
                }}
              >{g}</button>
            ))}
          </div>
        </div>

        <button
          onClick={save}
          disabled={!name.trim() || saving}
          style={{
            width: '100%', padding: '14px',
            background: name.trim() && !saving ? G.ink : G.hairline2,
            color: G.bg, border: 'none', borderRadius: 8,
            fontFamily: G.sans, fontSize: 14, fontWeight: 600, letterSpacing: 0.3,
            cursor: name.trim() && !saving ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
