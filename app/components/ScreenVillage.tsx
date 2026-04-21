'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { UserButton } from '@clerk/nextjs';
import { G } from './tokens';
import { GMasthead, GLabel, GAvatar, GHead } from './shared';
import { HouseholdSwitcher } from './HouseholdSwitcher';

type VillageGroup = 'inner' | 'family' | 'sitter';
type AppRole = 'parent' | 'caregiver';

type Adult = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  villageGroup: VillageGroup;
};

type Kid = {
  id: string;
  name: string;
  birthday: string | null;
  notes: string | null;
};

const GROUP_META: Record<VillageGroup, { label: string; note: string }> = {
  inner:  { label: 'Inner Circle',    note: 'rung first · no asking' },
  family: { label: 'Family & Close',  note: 'rung second' },
  sitter: { label: 'Trusted Sitters', note: 'paid · available on demand' },
};

function GroupHeader({ count, label, note }: { count: number; label: string; note: string }) {
  return (
    <div style={{ margin: '4px 0 10px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <GHead size={18}>{label}</GHead>
        <span style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted }}>· {count}</span>
      </div>
      <GLabel style={{ marginTop: 2 }}>{note}</GLabel>
    </div>
  );
}

function MemberCard({ name, role, isMe, appRole, onToggleRole, onDelete }: {
  name: string;
  role: string;
  isMe?: boolean;
  appRole?: AppRole;
  onToggleRole?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div style={{
      background: G.bg, border: `1px solid ${G.hairline}`,
      borderRadius: 8, padding: 12, position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <GAvatar name={name} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontFamily: G.display, fontSize: 14, fontWeight: 500, lineHeight: 1.15 }}>{name}</div>
            {isMe && (
              <span style={{
                fontFamily: G.sans, fontSize: 8, letterSpacing: 1, fontWeight: 700,
                color: G.muted, textTransform: 'uppercase',
              }}>· you</span>
            )}
          </div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 10.5, color: G.muted, marginTop: 2, lineHeight: 1.3 }}>{role}</div>
        </div>
        {onToggleRole && appRole && (
          <button onClick={onToggleRole} title="Toggle role" style={{
            background: appRole === 'parent' ? G.ink : 'transparent',
            color: appRole === 'parent' ? '#FBF7F0' : G.ink,
            border: `1px solid ${G.ink}`, borderRadius: 100,
            padding: '3px 8px', cursor: 'pointer',
            fontFamily: G.sans, fontSize: 8, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase',
          }}>{appRole === 'parent' ? 'P' : 'C'}</button>
        )}
        {onDelete && (
          <button onClick={onDelete} aria-label="Remove" style={{
            background: 'transparent', border: 'none', color: G.muted,
            fontSize: 16, cursor: 'pointer', padding: 4,
          }}>×</button>
        )}
      </div>
    </div>
  );
}

function EmptyGroup({ label }: { label: string }) {
  return (
    <div style={{
      background: G.paper, border: `1px dashed ${G.hairline2}`, borderRadius: 10,
      padding: 18, textAlign: 'center',
      fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.muted,
      marginBottom: 18,
    }}>
      No one in {label} yet.
    </div>
  );
}

function InviteSheet({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [kind, setKind] = useState<'adult' | 'kid'>('adult');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('caregiver');
  const [villageGroup, setVillageGroup] = useState<VillageGroup>('family');
  const [birthday, setBirthday] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  const sendInvite = async (mode: 'email' | 'link') => {
    setBusy(true); setError(null); setLinkUrl(null);
    try {
      const res = await fetch('/api/village/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, villageGroup, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (mode === 'link' && data.inviteUrl) {
        setLinkUrl(data.inviteUrl);
      } else {
        onInvited();
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const addKid = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/village', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'kid', name, birthday: birthday || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onInvited();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
    } catch {
      // clipboard may fail in iframes; show the URL anyway
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(27,23,19,0.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: G.bg, width: '100%', maxWidth: 480,
        borderRadius: '18px 18px 0 0', padding: '20px 24px 32px',
        borderTop: `1px solid ${G.ink}`, maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ width: 36, height: 4, background: G.hairline2, borderRadius: 4, margin: '0 auto 16px' }} />

        <div style={{ display: 'flex', gap: 4, marginBottom: 18, padding: 3,
          background: G.paper, border: `1px solid ${G.hairline2}`, borderRadius: 100 }}>
          {(['adult', 'kid'] as const).map(k => (
            <button key={k} onClick={() => setKind(k)} style={{
              flex: 1, padding: '8px 12px', borderRadius: 100,
              background: kind === k ? G.ink : 'transparent',
              color: kind === k ? '#FBF7F0' : G.ink2,
              border: 'none', cursor: 'pointer',
              fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}>{k === 'adult' ? 'Invite adult' : 'Add child'}</button>
          ))}
        </div>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <div style={{ fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: G.muted, marginBottom: 4 }}>Name</div>
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        </label>

        {kind === 'adult' ? (
          <>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={labelStyle}>Email (for email invite)</div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <label>
                <div style={labelStyle}>Role</div>
                <select value={role} onChange={e => setRole(e.target.value as AppRole)} style={inputStyle}>
                  <option value="parent">Parent</option>
                  <option value="caregiver">Caregiver</option>
                </select>
              </label>
              <label>
                <div style={labelStyle}>Group</div>
                <select value={villageGroup} onChange={e => setVillageGroup(e.target.value as VillageGroup)} style={inputStyle}>
                  <option value="inner">Inner Circle</option>
                  <option value="family">Family &amp; Close</option>
                  <option value="sitter">Trusted Sitter</option>
                </select>
              </label>
            </div>

            {linkUrl ? (
              <div style={{
                background: G.paper, border: `1px solid ${G.ink}`, borderRadius: 8,
                padding: 12, marginBottom: 12,
              }}>
                <div style={labelStyle}>Share this link</div>
                <div style={{ fontFamily: G.sans, fontSize: 11, color: G.ink, wordBreak: 'break-all', marginTop: 4 }}>{linkUrl}</div>
                <button onClick={copyLink} style={{ ...btnStyle, marginTop: 10, width: '100%' }}>Copy link</button>
              </div>
            ) : null}

            {error && <div style={{ color: '#B5342B', fontSize: 12, marginBottom: 10 }}>{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => sendInvite('email')} disabled={busy || !email.trim()} style={{ ...btnStyle, opacity: (busy || !email.trim()) ? 0.4 : 1 }}>
                Send email
              </button>
              <button onClick={() => sendInvite('link')} disabled={busy} style={{ ...btnStyleAlt, opacity: busy ? 0.4 : 1 }}>
                Copy link
              </button>
            </div>
          </>
        ) : (
          <>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={labelStyle}>Birthday (optional)</div>
              <input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} style={inputStyle} />
            </label>
            {error && <div style={{ color: '#B5342B', fontSize: 12, marginBottom: 10 }}>{error}</div>}
            <button onClick={addKid} disabled={busy || !name.trim()} style={{ ...btnStyle, width: '100%', opacity: (busy || !name.trim()) ? 0.4 : 1 }}>
              Add child
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1,
  textTransform: 'uppercase', color: G.muted, marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: G.paper, border: `1px solid ${G.hairline2}`, borderRadius: 8,
  fontFamily: G.sans, fontSize: 14, color: G.ink,
  outline: 'none',
};

const btnStyle: React.CSSProperties = {
  padding: '12px 20px',
  background: G.ink, color: '#FBF7F0', border: 'none', borderRadius: 100,
  fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.4,
  textTransform: 'uppercase', cursor: 'pointer',
};

const btnStyleAlt: React.CSSProperties = {
  ...btnStyle,
  background: 'transparent', color: G.ink, border: `1px solid ${G.ink}`,
};

export function ScreenVillage() {
  const [adults, setAdults] = useState<Adult[]>([]);
  const [kids, setKids] = useState<Kid[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [myRole, setMyRole] = useState<AppRole>('caregiver');
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [villageRes, meRes] = await Promise.all([
        fetch('/api/village'),
        fetch('/api/household'),
      ]);
      const data = await villageRes.json();
      if (villageRes.ok) {
        setAdults(data.adults || []);
        setKids(data.kids || []);
      }
      if (meRes.ok) {
        const me = await meRes.json();
        if (me.user?.role) setMyRole(me.user.role);
        if (me.user?.id) setMyUserId(me.user.id);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const removeAdult = async (id: string) => {
    if (!confirm('Remove this person from your household? They will lose access.')) return;
    const res = await fetch(`/api/household/members/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Failed to remove');
    }
    load();
  };
  const changeRole = async (id: string, role: AppRole) => {
    const res = await fetch(`/api/household/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Failed to change role');
    }
    load();
  };
  const removeKid = async (id: string) => {
    await fetch(`/api/village?type=kid&id=${id}`, { method: 'DELETE' });
    load();
  };

  const byGroup = (g: VillageGroup) => adults.filter(a => a.villageGroup === g);
  const total = adults.length + kids.length;

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: G.bg, color: G.ink }}>
      <GMasthead
        leftAction={<HouseholdSwitcher />}
        rightAction={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GLabel color={G.clay}>
              {myRole === 'parent' ? (total === 0 ? 'empty · + add' : `${total} people · + add`) : `${total} people`}
            </GLabel>
            <UserButton />
          </div>
        }
        title="The Village"
        tagline="Grouped by how close they are when the call goes out."
        folioLeft="No. 142" folioRight="Homestead Press"
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 120px' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', fontFamily: G.serif, fontStyle: 'italic', color: G.muted }}>
            Loading your village…
          </div>
        ) : total === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 22, color: G.ink, marginBottom: 8 }}>
              Your village is empty.
            </div>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.ink2, marginBottom: 20, maxWidth: 280, margin: '0 auto 20px' }}>
              Invite family and caregivers who help with the kids.
            </div>
            {myRole === 'parent' && (
              <button onClick={() => setShowInvite(true)} style={btnStyle}>Invite or add</button>
            )}
          </div>
        ) : (
          <>
            {(['inner', 'family', 'sitter'] as const).map(g => {
              const members = byGroup(g);
              const meta = GROUP_META[g];
              return (
                <div key={g}>
                  <GroupHeader count={members.length} label={meta.label} note={meta.note} />
                  {members.length === 0 ? <EmptyGroup label={meta.label} /> : (
                    <div style={{
                      background: g === 'inner' ? G.paper : 'transparent',
                      border: g === 'inner' ? `1px solid ${G.hairline2}` : 'none',
                      borderRadius: g === 'inner' ? 10 : 0,
                      padding: g === 'inner' ? 14 : 0,
                      marginBottom: 18,
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: g === 'inner' ? 'repeat(2, 1fr)' : '1fr', gap: 10 }}>
                        {members.map(m => {
                          const isMe = myUserId === m.id;
                          const canManage = myRole === 'parent' && !isMe;
                          return (
                            <MemberCard
                              key={m.id}
                              name={m.name}
                              role={`${m.role}${m.email ? ` · ${m.email}` : ''}`}
                              isMe={isMe}
                              appRole={canManage ? m.role : undefined}
                              onToggleRole={canManage ? () => changeRole(m.id, m.role === 'parent' ? 'caregiver' : 'parent') : undefined}
                              onDelete={canManage ? () => removeAdult(m.id) : undefined}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <GroupHeader count={kids.length} label="The Kids" note="who we&rsquo;re coordinating for" />
            {kids.length === 0 ? <EmptyGroup label="the kids" /> : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginBottom: 18 }}>
                {kids.map(k => (
                  <MemberCard
                    key={k.id}
                    name={k.name}
                    role={k.birthday ? `born ${k.birthday}` : 'child'}
                    onDelete={myRole === 'parent' ? () => removeKid(k.id) : undefined}
                  />
                ))}
              </div>
            )}

            <div style={{
              marginTop: 26, padding: 18, textAlign: 'center',
              borderTop: `1px solid ${G.ink}`, borderBottom: `1px solid ${G.ink}`,
            }}>
              <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 17, color: G.ink, lineHeight: 1.3 }}>
                &ldquo;Many hands make light work.&rdquo;
              </div>
              {myRole === 'parent' && (
                <button onClick={() => setShowInvite(true)} style={{ ...btnStyle, marginTop: 12 }}>
                  Invite or add
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {showInvite && <InviteSheet onClose={() => setShowInvite(false)} onInvited={load} />}
    </div>
  );
}
