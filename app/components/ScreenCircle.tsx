'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { G, SCRIM } from './tokens';
import { GMasthead, GLabel, GAvatar, GHead } from './shared';
import { HouseholdSwitcher, useHousehold } from './HouseholdSwitcher';
import { shortName } from '@/lib/format';
import { getCopy } from '@/lib/copy';

async function uploadPhoto(file: File, targetType: 'user' | 'kid', targetId: string): Promise<string | null> {
  const form = new FormData();
  form.append('file', file);
  form.append('type', targetType);
  form.append('id', targetId);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.url ?? null;
}

type VillageGroup = 'covey' | 'field';
type AppRole = 'keeper' | 'watcher';

type Adult = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  villageGroup: VillageGroup;
  photoUrl: string | null;
};

type Kid = {
  id: string;
  name: string;
  birthday: string | null;
  notes: string | null;
  photoUrl: string | null;
};

function getGroupMeta(): Record<VillageGroup, { label: string; note: string }> {
  return {
    covey: { label: getCopy().circle.innerLabel, note: getCopy().circle.innerNote },
    field: { label: getCopy().circle.outerLabel, note: getCopy().circle.outerNote },
  };
}

const GroupHeader = React.memo(function GroupHeader({ count, label, note }: { count: number; label: string; note: string }) {
  return (
    <div style={{ margin: '4px 0 10px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <GHead size={18}>{label}</GHead>
        <span style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted }}>· {count}</span>
      </div>
      <GLabel style={{ marginTop: 2 }}>{note}</GLabel>
    </div>
  );
});

const GROUP_CYCLE: VillageGroup[] = ['covey', 'field'];
function getGroupLabel(): Record<VillageGroup, string> {
  return {
    covey: getCopy().circle.innerLabel.split(/\s+/).map(word => word[0]).join('').toUpperCase(),
    field: getCopy().circle.outerLabel.split(/\s+/).map(word => word[0]).join('').toUpperCase(),
  };
}
function getGroupTitle(): Record<VillageGroup, string> {
  return {
    covey: getCopy().circle.innerLabel,
    field: getCopy().circle.outerLabel.replace(/s$/, ''),
  };
}

const MemberCard = React.memo(function MemberCard({ name, role, isMe, appRole, onToggleRole, villageGroup, onChangeGroup, onDelete, photoUrl, targetType, targetId, onPhotoChange, canEditPhoto }: {
  name: string;
  role: string;
  isMe?: boolean;
  appRole?: AppRole;
  onToggleRole?: () => void;
  villageGroup?: VillageGroup;
  onChangeGroup?: (g: VillageGroup) => void;
  onDelete?: () => void;
  photoUrl?: string | null;
  targetType?: 'user' | 'kid';
  targetId?: string;
  onPhotoChange?: (url: string) => void;
  // Audit 2026-05-06 (matrix §2.4): hide upload affordance on cards the viewer
  // cannot edit. /api/upload also enforces server-side; this is UI parity.
  // Default true preserves prior behavior for any unmigrated call site.
  canEditPhoto?: boolean;
}) {
  const photoEditable = canEditPhoto ?? true;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Route through the auth proxy so private blobs are accessible.
  // When targetId is set and a photo exists, use /api/photo/[id].
  // When there is no targetId (display-only cards), fall back to photoUrl as-is.
  const initialPhoto = photoUrl && targetId ? `/api/photo/${targetId}` : (photoUrl ?? null);
  const [localPhoto, setLocalPhoto] = useState<string | null>(initialPhoto);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !targetType || !targetId) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (['heic', 'heif', 'avif'].includes(ext)) {
      setUploadError('Use a JPG or PNG photo — HEIC isn\'t supported yet.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadPhoto(file, targetType, targetId);
      if (url) {
        setLocalPhoto(url);
        onPhotoChange?.(url);
      } else {
        setUploadError('Upload failed — photo storage may not be configured yet.');
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed. Try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const size = 36;
  return (
    <div style={{
      background: G.paper, border: `1px solid ${G.hairline}`,
      borderRadius: 8, padding: '10px 12px', position: 'relative',
      userSelect: 'none', WebkitUserSelect: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {localPhoto ? (
            <img src={localPhoto} alt={name} style={{
              width: size, height: size, borderRadius: size,
              objectFit: 'cover', display: 'block',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)',
            }} />
          ) : (
            <GAvatar name={name} size={size} />
          )}
          {targetType && targetId && photoEditable && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title="Change photo"
                style={{
                  position: 'absolute', bottom: -2, right: -2,
                  width: 14, height: 14, borderRadius: 14,
                  background: G.green, border: `1.5px solid ${G.bg}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: uploading ? 'wait' : 'pointer',
                }}
              >
                {uploading ? (
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.5)' }} />
                ) : (
                  <svg width="7" height="7" viewBox="0 0 10 10" fill="none">
                    <path d="M5 2v6M2 5h6" stroke={G.bg} strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFile}
                style={{ display: 'none' }} />
            </>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ fontFamily: G.display, fontSize: 14, fontWeight: 400, lineHeight: 1.15 }}>{name}</div>
            {isMe && (
              <span style={{ fontFamily: G.sans, fontSize: 8, letterSpacing: 1, fontWeight: 700, color: G.muted, textTransform: 'uppercase' }}>· you</span>
            )}
          </div>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 10, color: G.muted, marginTop: 1 }}>
            {role === 'keeper' ? getCopy().roles.keeper.singular.toLowerCase() : role === 'watcher' ? getCopy().roles.watcher.singular.toLowerCase() : role}
          </div>
        </div>
        {((villageGroup && onChangeGroup) || (onToggleRole && appRole) || onDelete) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            {villageGroup && onChangeGroup && (
              <button
                onClick={() => setPickerOpen(true)}
                style={{
                  background: G.green, color: G.bg,
                  border: `1px solid ${G.hairline2}`, borderRadius: 100,
                  padding: '3px 8px', cursor: 'pointer',
                  fontFamily: G.sans, fontSize: 8, fontWeight: 700, letterSpacing: 0.8,
                  textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 3,
                }}
              >
                <span>{getGroupLabel()[villageGroup]}</span>
                <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3.5l3 3 3-3" />
                </svg>
              </button>
            )}
            {onToggleRole && appRole && (
              <button onClick={onToggleRole} title={`Switch to ${appRole === 'keeper' ? getCopy().roles.watcher.singular : getCopy().roles.keeper.singular}`} style={{
                background: appRole === 'keeper' ? G.green : 'transparent',
                color: appRole === 'keeper' ? G.bg : G.ink,
                border: `1px solid ${G.green}`, borderRadius: 100,
                padding: '3px 7px', cursor: 'pointer',
                fontFamily: G.sans, fontSize: 8, fontWeight: 700, letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}>{appRole === 'keeper' ? getCopy().roles.keeper.singular : getCopy().roles.watcher.singular}</button>
            )}
            {onDelete && (
              confirmingDelete ? (
                <>
                  <button
                    disabled={deleting}
                    onClick={() => { setConfirmingDelete(false); setDeleting(true); onDelete(); }}
                    style={{
                      padding: '3px 8px', background: G.green, color: G.bg,
                      border: 'none', borderRadius: 100,
                      fontFamily: G.sans, fontSize: 8, fontWeight: 700, letterSpacing: 1,
                      textTransform: 'uppercase', cursor: deleting ? 'wait' : 'pointer',
                      opacity: deleting ? 0.6 : 1,
                    }}>Remove</button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    style={{
                      padding: '3px 8px', background: 'transparent', color: G.muted,
                      border: `1px solid ${G.hairline2}`, borderRadius: 100,
                      fontFamily: G.sans, fontSize: 8, fontWeight: 700, letterSpacing: 1,
                      textTransform: 'uppercase', cursor: 'pointer',
                    }}>Keep</button>
                </>
              ) : (
                <button onClick={() => setConfirmingDelete(true)} aria-label="Remove" style={{
                  background: 'transparent', border: `1px solid ${G.hairline2}`,
                  borderRadius: 100, color: G.muted,
                  width: 24, height: 24, padding: 0, lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontSize: 14,
                }}>×</button>
              )
            )}
          </div>
        )}
      </div>
      {uploadError && (
        <div style={{
          marginTop: 6, padding: '6px 10px', borderRadius: 6,
          background: G.claySoft, border: `1px solid ${G.clay}`,
          fontFamily: G.serif, fontStyle: 'italic', fontSize: 11, color: G.clay,
        }}>{uploadError}</div>
      )}
      {pickerOpen && villageGroup && onChangeGroup && (
        <div onClick={() => setPickerOpen(false)} style={{
          position: 'fixed', inset: 0, background: SCRIM, zIndex: 1100,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: G.bg, width: '100%', maxWidth: 480,
            borderRadius: '18px 18px 0 0', padding: '20px 24px calc(32px + env(safe-area-inset-bottom, 0px))',
            borderTop: `1px solid ${G.hairline}`,
          }}>
            <div style={{ width: 36, height: 4, background: G.hairline2, borderRadius: 4, margin: '0 auto 16px' }} />
            <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 20, color: G.green, marginBottom: 4 }}>
              Move {name} to…
            </div>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted, marginBottom: 14 }}>
              Currently in {getGroupTitle()[villageGroup]}.
            </div>
            {(GROUP_CYCLE).map(g => (
              <button
                key={g}
                onClick={() => { if (g !== villageGroup) onChangeGroup(g); setPickerOpen(false); }}
                style={{
                  display: 'block', width: '100%', marginBottom: 8,
                  padding: '14px 16px', textAlign: 'left',
                  background: g === villageGroup ? G.green : 'transparent',
                  color: g === villageGroup ? G.bg : G.ink,
                  border: `1px solid ${g === villageGroup ? G.green : G.hairline2}`,
                  borderRadius: 8, cursor: 'pointer',
                  fontFamily: G.display, fontSize: 15, fontWeight: 500,
                }}
              >
                {getGroupTitle()[g]}
                {g === villageGroup && (
                  <span style={{ fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', marginLeft: 8, opacity: 0.7 }}>
                    · current
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

function InviteSheet({ onClose, onInvited, caregiverMode }: { onClose: () => void; onInvited: () => void; caregiverMode?: boolean }) {
  // Caregivers can only invite families (adults), never add chicks
  const [kind, setKind] = useState<'adult' | 'kid'>(caregiverMode ? 'adult' : 'adult');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('watcher');
  const [villageGroup, setVillageGroup] = useState<VillageGroup>('covey');
  const [birthday, setBirthday] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  const sendInvite = async (mode: 'email' | 'link') => {
    setBusy(true); setError(null); setLinkUrl(null);
    try {
      const endpoint = caregiverMode ? '/api/circle/invite-family' : '/api/circle/invite';
      // caregiverMode is the watcher's "Invite a family" path — server forces
      // appRole='keeper' and householdMode='create_new' regardless of payload
      // (per Circle/invite/role audit 2026-05-06, matrix §2.1). Don't send role
      // or villageGroup; both are ignored server-side and would only make the
      // payload look like an attempted privilege escalation in logs.
      const payload = caregiverMode
        ? { parentName: name, parentEmail: email, mode }
        : { name, email, role, villageGroup, mode };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      const res = await fetch('/api/circle', {
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
      position: 'fixed', inset: 0, background: SCRIM,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1200,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: G.bg, width: '100%', maxWidth: 480,
        borderRadius: '18px 18px 0 0', padding: '20px 24px calc(32px + env(safe-area-inset-bottom, 0px))',
        borderTop: `1px solid ${G.hairline}`, maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ width: 36, height: 4, background: G.hairline2, borderRadius: 4, margin: '0 auto 16px' }} />

        {caregiverMode ? (
          <div style={{
            marginBottom: 18, padding: '10px 12px', borderRadius: 8,
            background: G.paper, border: `1px solid ${G.hairline2}`,
            fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.ink2, lineHeight: 1.5,
          }}>
            Invite a parent of a family you help. They&rsquo;ll get a link to accept — you&rsquo;ll be linked as their caregiver automatically.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 4, marginBottom: 18, padding: 3,
            background: G.paper, border: `1px solid ${G.hairline2}`, borderRadius: 100 }}>
            {(['adult', 'kid'] as const).map(k => (
              <button key={k} onClick={() => { setKind(k); setName(''); setEmail(''); setBirthday(''); setError(null); setLinkUrl(null); }} style={{
                flex: 1, padding: '8px 12px', borderRadius: 100,
                background: kind === k ? G.green : 'transparent',
                color: kind === k ? G.bg : G.ink2,
                border: 'none', cursor: 'pointer',
                fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}>{k === 'adult' ? 'Invite adult' : `Add ${getCopy().circle.kidLabel.toLowerCase()}`}</button>
            ))}
          </div>
        )}

        {kind === 'adult' ? (
          <>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={{ fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: G.muted, marginBottom: 4 }}>Name</div>
              <input value={name} onChange={e => setName(e.target.value)} style={{ ...inputStyle, boxSizing: 'border-box' }} />
            </label>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={labelStyle}>Email (for email invite)</div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
            </label>

            {caregiverMode ? (
              // Audit 2026-05-06: watchers cannot pick villageGroup. Server
              // forces 'covey' on this path and the household_mode='create_new'
              // branch makes circle-tier irrelevant anyway (the invitee gets
              // their own household). Selector intentionally omitted.
              null
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <label>
                  <div style={labelStyle}>Role</div>
                  <select value={role} onChange={e => setRole(e.target.value as AppRole)} style={inputStyle}>
                    <option value="keeper">{getCopy().roles.keeper.singular}</option>
                    <option value="watcher">{getCopy().roles.watcher.singular}</option>
                  </select>
                </label>
                <label>
                  <div style={labelStyle}>Group</div>
                  <select value={villageGroup} onChange={e => setVillageGroup(e.target.value as VillageGroup)} style={inputStyle}>
                    <option value="covey">{getGroupTitle().covey}</option>
                    <option value="field">{getGroupTitle().field}</option>
                  </select>
                </label>
              </div>
            )}

            {linkUrl ? (
              <div style={{
                background: G.paper, border: `1px solid ${G.hairline2}`, borderRadius: 8,
                padding: 12, marginBottom: 12,
              }}>
                <div style={labelStyle}>Share this link</div>
                <div style={{ fontFamily: G.sans, fontSize: 11, color: G.ink, wordBreak: 'break-all', marginTop: 4 }}>{linkUrl}</div>
                <button onClick={copyLink} style={{ ...btnStyle, marginTop: 10, width: '100%' }}>Copy link</button>
              </div>
            ) : null}

            {error && <div style={{ color: G.clay, fontSize: 12, marginBottom: 10 }}>{error}</div>}

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
              <div style={{ fontFamily: G.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: G.muted, marginBottom: 4 }}>Name</div>
              <input value={name} onChange={e => setName(e.target.value)} style={{ ...inputStyle, boxSizing: 'border-box' }} />
            </label>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={labelStyle}>Birthday (optional)</div>
              <input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} style={{ ...inputStyle, boxSizing: 'border-box', maxWidth: '100%', minWidth: 0, WebkitAppearance: 'none' }} />
            </label>
            {error && (
              <div style={{
                padding: '10px 12px', borderRadius: 8, marginBottom: 12,
                background: G.claySoft, border: `1px solid ${G.clay}`,
                fontFamily: G.serif, fontStyle: 'italic', fontSize: 12, color: G.clay,
              }}>{error}</div>
            )}
            <button onClick={addKid} disabled={busy || !name.trim()} style={{ ...btnStyle, width: '100%', opacity: (busy || !name.trim()) ? 0.4 : 1 }}>
              {busy ? 'Adding…' : `Add ${getCopy().circle.kidLabel.toLowerCase()}`}
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
  width: '100%', padding: '10px 12px', boxSizing: 'border-box',
  background: G.paper, border: `1px solid ${G.ink2}`, borderRadius: 8,
  fontFamily: G.sans, fontSize: 16, color: G.ink,
  outline: 'none',
};

const btnStyle: React.CSSProperties = {
  padding: '12px 20px',
  background: G.green, color: G.bg, border: 'none', borderRadius: 100,
  fontFamily: G.sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.4,
  textTransform: 'uppercase', cursor: 'pointer',
};

const btnStyleAlt: React.CSSProperties = {
  ...btnStyle,
  background: 'transparent', color: G.green, border: `1px solid ${G.green}`,
};

// ── Caregiver view: My Families ──────────────────────────────────────────

type FamilyData = {
  household: { id: string; name: string; glyph: string };
  adults: Adult[];
  chicks: Kid[];
};

const FamilyCard = React.memo(function FamilyCard({ family, myUserId, onLeave }: {
  family: FamilyData;
  myUserId?: string;
  onLeave?: () => void;
}) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const parents = family.adults.filter(a => a.role === 'keeper');
  const caregivers = family.adults.filter(a => a.role === 'watcher');
  return (
    <div style={{
      background: G.paper, border: `1px solid ${G.hairline2}`,
      borderRadius: 10, padding: 12, marginBottom: 8,
    }}>
      {/* Header: glyph + name + leave button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>{family.household.glyph}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: G.display, fontSize: 15, fontWeight: 500, color: G.ink, lineHeight: 1.15 }}>
            {family.household.name}
          </div>
        </div>
        {onLeave && !confirmLeave && (
          <button onClick={() => setConfirmLeave(true)} style={{
            background: 'transparent', color: G.muted, border: `1px solid ${G.hairline2}`,
            borderRadius: 100, padding: '3px 8px', cursor: 'pointer',
            fontFamily: G.sans, fontSize: 8, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', flexShrink: 0,
          }}>Leave</button>
        )}
        {onLeave && confirmLeave && (
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
            <button
              disabled={leaving}
              onClick={async () => { setLeaving(true); await onLeave(); }}
              style={{
                background: G.green, color: G.bg, border: 'none',
                borderRadius: 100, padding: '3px 8px', cursor: leaving ? 'wait' : 'pointer',
                fontFamily: G.sans, fontSize: 8, fontWeight: 700, letterSpacing: 1,
                textTransform: 'uppercase', opacity: leaving ? 0.6 : 1,
              }}>{leaving ? '…' : 'Yes, leave'}</button>
            <button onClick={() => setConfirmLeave(false)} style={{
              background: 'transparent', color: G.muted, border: `1px solid ${G.hairline2}`,
              borderRadius: 100, padding: '3px 8px', cursor: 'pointer',
              fontFamily: G.sans, fontSize: 8, fontWeight: 700, letterSpacing: 1,
              textTransform: 'uppercase',
            }}>Keep</button>
          </div>
        )}
      </div>

      {/* Row 1: Parents + Kids */}
      {(parents.length > 0 || family.chicks.length > 0) && (
        <div style={{ display: 'flex', gap: 16, marginBottom: caregivers.length > 0 ? 8 : 0 }}>
          {parents.length > 0 && (
            <div style={{ flex: 1 }}>
              <GLabel style={{ marginBottom: 5 }}>{getCopy().roles.keeper.plural}</GLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {parents.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <GAvatar name={p.name} size={26} />
                    <span style={{ fontFamily: G.display, fontSize: 12, fontWeight: 500 }}>{shortName(p.name)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {family.chicks.length > 0 && (
            <div style={{ flex: 1 }}>
              <GLabel style={{ marginBottom: 5 }}>Your {getCopy().circle.kidLabel}s</GLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {family.chicks.map(k => (
                  <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <GAvatar name={k.name} size={26} />
                    <span style={{ fontFamily: G.display, fontSize: 12, fontWeight: 500 }}>{shortName(k.name)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Row 2: Watchers */}
      {caregivers.length > 0 && (
        <div>
          <GLabel style={{ marginBottom: 5 }}>{getCopy().roles.watcher.plural}</GLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {caregivers.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <GAvatar name={c.name} size={22} />
                <span style={{ fontFamily: G.sans, fontSize: 10, color: G.ink2 }}>{shortName(c.name)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

function CaregiverVillage({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const [families, setFamilies] = useState<FamilyData[] | null>(null);
  const [myUserIds, setMyUserIds] = useState<Set<string>>(new Set());
  const [showInvite, setShowInvite] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [villageRes, householdRes] = await Promise.all([
        fetch('/api/circle?scope=all'),
        fetch('/api/household'),
      ]);
      if (!villageRes.ok) {
        setLoadError("Couldn't load your families. Tap Retry.");
        setFamilies(prev => prev ?? []);
        return;
      }
      const data = await villageRes.json();
      setFamilies(data.families || []);
      setLoadError(null);
      // Build set of my own users.id values across all households
      if (householdRes.ok) {
        const hh = await householdRes.json();
        if (hh.user?.id) setMyUserIds(new Set([hh.user.id]));
      }
    } catch {
      setLoadError("Couldn't load your families. Tap Retry.");
      setFamilies(prev => prev ?? []);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const count = families?.length ?? 0;

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: G.bg, color: G.ink }}>
      <GMasthead
        leftAction={<HouseholdSwitcher />}
        rightAction={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GLabel color={G.clay}>{count} {count === 1 ? 'family' : 'families'}</GLabel>
            {onOpenSettings && (
              <button onClick={onOpenSettings} aria-label="Settings" style={{
                background: 'transparent',
                border: `1px solid ${G.hairline2}`,
                borderRadius: 100,
                padding: '4px 10px',
                cursor: 'pointer',
                color: G.ink,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
                textTransform: 'uppercase',
                minHeight: 28,
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span>Settings</span>
              </button>
            )}
          </div>
        }
        title="My Families"
        tagline="The families you help with."
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: `4px 24px calc(100px + env(safe-area-inset-bottom, 0px))` }}>
        {loadError && (
          <div style={{
            margin: '8px 0', padding: '10px 14px', borderRadius: 8,
            background: G.claySoft, border: `1px solid ${G.clay}`,
            fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.clay,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{loadError}</span>
            <button onClick={() => load()} style={{ background: 'none', border: 'none', color: G.clay, fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', padding: 0 }}>Retry</button>
          </div>
        )}
        {families === null ? (
          <div style={{ padding: 40, textAlign: 'center', fontFamily: G.serif, fontStyle: 'italic', color: G.muted }}>
            Loading…
          </div>
        ) : families.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 20, color: G.ink, marginBottom: 8 }}>
              No families yet.
            </div>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.ink2, marginBottom: 20, maxWidth: 280, margin: '0 auto 20px' }}>
              Invite a family you help — they&rsquo;ll receive a link to accept.
            </div>
          </div>
        ) : (
          families.map(f => {
            const myRow = f.adults.find(a => myUserIds.has(a.id));
            return (
              <FamilyCard
                key={f.household.id}
                family={f}
                myUserId={myRow?.id}
                onLeave={myRow ? async () => {
                  await fetch('/api/circle/leave', { method: 'POST' });
                  await load();
                } : undefined}
              />
            );
          })
        )}

        <div style={{
          marginTop: 16, padding: 18, textAlign: 'center',
          borderTop: `1px solid ${G.hairline2}`,
        }}>
          <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.muted, marginBottom: 12, lineHeight: 1.5 }}>
            Helping another family? Send them an invite to link up on {getCopy().brand.name}.
          </div>
          <button onClick={() => setShowInvite(true)} style={btnStyle}>
            Invite a family
          </button>
        </div>
      </div>

      {showInvite && <InviteSheet onClose={() => setShowInvite(false)} onInvited={load} caregiverMode />}
    </div>
  );
}

// ── Parent view ───────────────────────────────────────────────────────────

export function ScreenCircle({ role: roleProp, onOpenSettings }: { role?: 'keeper' | 'watcher'; onOpenSettings?: () => void }) {
  const { refresh: refreshHousehold } = useHousehold();
  const [adults, setAdults] = useState<Adult[]>([]);
  const [chicks, setChicks] = useState<Kid[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const myRole: AppRole = roleProp ?? 'keeper';
  const [myUserId, setMyUserId] = useState<string | null>(null);
  // Matrix §2.1.2: keeper-non-admin must not see the Invite button. Server
  // returns 403 either way, but the UI gate prevents a silent failure on tap.
  const [isAdmin, setIsAdmin] = useState(false);
  const canInvite = myRole === 'keeper' && isAdmin;

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [villageRes, meRes] = await Promise.all([
        fetch('/api/circle', { signal }),
        fetch('/api/household', { signal }),
      ]);
      if (!villageRes.ok) {
        setLoadError(`Couldn't load ${getCopy().circle.title.toLowerCase()}. Pull to refresh.`);
      } else {
        const data = await villageRes.json();
        setAdults(data.adults || []);
        setChicks(data.chicks || []);
        setLoadError(null);
      }
      if (meRes.ok) {
        const me = await meRes.json();
        if (me.user?.id) setMyUserId(me.user.id);
        setIsAdmin(Boolean(me.user?.isAdmin));
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setLoadError(`Couldn't load ${getCopy().circle.title.toLowerCase()}. Pull to refresh.`);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [villageError, setVillageError] = useState<string | null>(null);

  async function saveRename() {
    if (!newName.trim() || renameBusy) return;
    setRenameBusy(true);
    try {
      const res = await fetch('/api/household', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        setRenaming(false);
        await Promise.all([load(), refreshHousehold()]);
      }
    } finally {
      setRenameBusy(false);
    }
  }

  const removeAdult = useCallback(async (id: string) => {
    const res = await fetch(`/api/household/members/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setVillageError(data.error || 'Could not remove member. Try again.');
    }
    load();
  }, [load]);
  const changeRole = useCallback(async (id: string, role: AppRole) => {
    const res = await fetch(`/api/household/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setVillageError(data.error || 'Failed to change role');
    }
    load();
  }, [load]);
  const changeGroup = useCallback(async (id: string, villageGroup: VillageGroup) => {
    const res = await fetch(`/api/household/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ villageGroup }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setVillageError(data.error || 'Failed to move circle');
    }
    load();
  }, [load]);
  const removeKid = useCallback(async (id: string) => {
    setChicks(prev => prev.filter(k => k.id !== id));
    await fetch(`/api/circle?type=kid&id=${id}`, { method: 'DELETE' });
    load();
  }, [load]);

  const onPhotoChange = useCallback(() => { load(); }, [load]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  if (!loading && myRole === 'watcher') return <CaregiverVillage onOpenSettings={onOpenSettings} />;

  const watchersByGroup = (g: VillageGroup) => adults.filter(a => a.villageGroup === g && a.role === 'watcher');
  const parents = adults.filter(a => a.role === 'keeper');
  const total = adults.length + chicks.length;

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: G.bg, color: G.ink }}>
      <GMasthead
        leftAction={<HouseholdSwitcher />}
        rightAction={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {myRole === 'keeper' && (
              <button onClick={() => { setNewName(''); setRenaming(true); }} style={{
                background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                fontFamily: G.sans, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase',
                color: G.muted, textDecoration: 'underline', textUnderlineOffset: 2,
              }}>rename</button>
            )}
            {onOpenSettings && (
              <button onClick={onOpenSettings} aria-label="Settings" style={{
                background: 'transparent',
                border: `1px solid ${G.hairline2}`,
                borderRadius: 100,
                padding: '4px 10px',
                cursor: 'pointer',
                color: G.ink,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
                textTransform: 'uppercase',
                minHeight: 28,
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span>Settings</span>
              </button>
            )}
          </div>
        }
        title={getCopy().circle.title}
        tagline="Grouped by how close they are when the call goes out."
      />

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: `4px 24px calc(100px + env(safe-area-inset-bottom, 0px))` }}>
        {villageError && (
          <div style={{
            margin: '8px 0', padding: '10px 14px', borderRadius: 8,
            background: G.claySoft, color: G.clay,
            fontFamily: G.serif, fontStyle: 'italic', fontSize: 13,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{villageError}</span>
            <button onClick={() => setVillageError(null)} style={{ background: 'none', border: 'none', color: G.clay, fontSize: 16, cursor: 'pointer', padding: 0 }}>×</button>
          </div>
        )}
        {loadError && (
          <div style={{
            margin: '8px 0', padding: '10px 14px', borderRadius: 8,
            background: G.claySoft, border: `1px solid ${G.clay}`,
            fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.clay,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{loadError}</span>
            <button onClick={() => load()} style={{ background: 'none', border: 'none', color: G.clay, fontFamily: G.sans, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', padding: 0 }}>Retry</button>
          </div>
        )}
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', fontFamily: G.serif, fontStyle: 'italic', color: G.muted }}>
            {getCopy().circle.loadingState}
          </div>
        ) : total === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 22, color: G.ink, marginBottom: 8 }}>
              {getCopy().circle.emptyState}
            </div>
            <div style={{ fontFamily: G.serif, fontStyle: 'italic', fontSize: 13, color: G.ink2, marginBottom: 20, maxWidth: 280, margin: '0 auto 20px' }}>
              Invite family and {getCopy().roles.watcher.plural.toLowerCase()} who help with the {getCopy().circle.kidLabel.toLowerCase()}s.
            </div>
            {canInvite && (
              <button onClick={() => setShowInvite(true)} style={btnStyle}>Invite or add</button>
            )}
          </div>
        ) : (
          <>
            {/* Family section — parents + chicks. Renders above Covey/Field. */}
            <div>
              <GroupHeader
                count={parents.length + chicks.length}
                label={getCopy().circle.familyLabel}
                note={getCopy().circle.familyNote}
              />
              {(parents.length + chicks.length) === 0 ? (
                <div style={{
                  background: 'transparent',
                  border: `1px dashed ${G.hairline2}`,
                  borderRadius: 10, padding: 18, textAlign: 'center',
                  fontFamily: G.serif, fontStyle: 'italic', fontSize: 12,
                  color: G.muted, marginBottom: 18,
                }}>
                  No one in {getCopy().circle.familyLabel} yet.
                </div>
              ) : (
                <div style={{
                  background: G.paper,
                  border: `1px solid ${G.hairline2}`,
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 18,
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                    {parents.map(p => {
                      const isMe = myUserId === p.id;
                      const canManage = myRole === 'keeper' && !isMe;
                      return (
                        <MemberCard
                          key={p.id}
                          name={shortName(p.name)}
                          role={p.role}
                          isMe={isMe}
                          appRole={canManage ? p.role : undefined}
                          onToggleRole={canManage ? () => changeRole(p.id, p.role === 'keeper' ? 'watcher' : 'keeper') : undefined}
                          onDelete={canManage ? () => removeAdult(p.id) : undefined}
                          photoUrl={p.photoUrl}
                          targetType="user"
                          targetId={p.id}
                          onPhotoChange={onPhotoChange}
                          // Audit 2026-05-06 §2.4: own-photo only for adults.
                          canEditPhoto={isMe}
                        />
                      );
                    })}
                    {chicks.map(k => (
                      <MemberCard
                        key={k.id}
                        name={k.name}
                        role={k.birthday ? `born ${k.birthday}` : getCopy().circle.kidLabel.toLowerCase()}
                        onDelete={myRole === 'keeper' ? () => removeKid(k.id) : undefined}
                        photoUrl={k.photoUrl}
                        targetType="kid"
                        targetId={k.id}
                        onPhotoChange={() => load()}
                        // Audit 2026-05-06 §2.4: keepers may edit any chick in
                        // their own household; watchers may not edit chicks.
                        canEditPhoto={myRole === 'keeper'}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {(['covey', 'field'] as const).map(g => {
              const members = watchersByGroup(g);
              const meta = getGroupMeta()[g];
              return (
                <div key={g}>
                  <GroupHeader count={members.length} label={meta.label} note={meta.note} />
                  {members.length === 0 ? (
                    <div style={{
                      background: 'transparent',
                      border: `1px dashed ${G.hairline2}`,
                      borderRadius: 10, padding: 18, textAlign: 'center',
                      fontFamily: G.serif, fontStyle: 'italic', fontSize: 12,
                      color: G.muted, marginBottom: 18,
                    }}>
                      No one in {meta.label} yet.
                    </div>
                  ) : (
                    <div style={{
                      background: g === 'covey' ? G.paper : 'transparent',
                      border: g === 'covey' ? `1px solid ${G.hairline2}` : 'none',
                      borderRadius: g === 'covey' ? 10 : 0,
                      padding: g === 'covey' ? 14 : 0,
                      marginBottom: 18,
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                        {members.map(m => {
                          const isMe = myUserId === m.id;
                          const canManage = myRole === 'keeper' && !isMe;
                          return (
                            <MemberCard
                              key={m.id}
                              name={shortName(m.name)}
                              role={m.role}
                              isMe={isMe}
                              appRole={canManage ? m.role : undefined}
                              onToggleRole={canManage ? () => changeRole(m.id, m.role === 'keeper' ? 'watcher' : 'keeper') : undefined}
                              villageGroup={canManage ? m.villageGroup : undefined}
                              onChangeGroup={canManage ? (vg) => changeGroup(m.id, vg) : undefined}
                              onDelete={canManage ? () => removeAdult(m.id) : undefined}
                              photoUrl={m.photoUrl}
                              targetType="user"
                              targetId={m.id}
                              onPhotoChange={onPhotoChange}
                              // Audit 2026-05-06 §2.4: own-photo only for adults.
                              canEditPhoto={isMe}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{
              marginTop: 26, padding: 18, textAlign: 'center',
              borderTop: `1px solid ${G.ink}`, borderBottom: `1px solid ${G.ink}`,
            }}>
              <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 17, color: G.ink, lineHeight: 1.3 }}>
                &ldquo;{getCopy().circle.quote}&rdquo;
              </div>
              {canInvite && (
                <button onClick={() => setShowInvite(true)} style={{ ...btnStyle, marginTop: 12 }}>
                  Invite or add
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {showInvite && <InviteSheet onClose={() => setShowInvite(false)} onInvited={load} />}

      {renaming && (
        <div style={{
          position: 'fixed', inset: 0, background: SCRIM,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1200,
        }} onClick={() => setRenaming(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: G.bg, width: '100%', maxWidth: 480,
            borderRadius: '18px 18px 0 0', padding: '20px 24px calc(32px + env(safe-area-inset-bottom, 0px))',
            borderTop: `1px solid ${G.ink}`,
          }}>
            <div style={{ width: 36, height: 4, background: G.hairline2, borderRadius: 4, margin: '0 auto 16px' }} />
            <div style={{ fontFamily: G.display, fontStyle: 'italic', fontSize: 20, color: G.ink, marginBottom: 14 }}>
              Rename {getCopy().brand.name}
            </div>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveRename()}
              autoFocus
              style={{
                width: '100%', padding: '12px 14px', marginBottom: 12,
                background: G.paper, border: `1px solid ${G.hairline2}`, borderRadius: 8,
                fontFamily: G.sans, fontSize: 15, color: G.ink, outline: 'none',
              }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => setRenaming(false)} style={{ ...btnStyle, background: 'transparent', color: G.ink, border: `1px solid ${G.ink}` }}>
                Cancel
              </button>
              <button onClick={saveRename} disabled={!newName.trim() || renameBusy} style={{ ...btnStyle, opacity: (!newName.trim() || renameBusy) ? 0.4 : 1 }}>
                {renameBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
