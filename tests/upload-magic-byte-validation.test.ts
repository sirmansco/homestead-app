/**
 * Regression tests for L27(a) — magic-byte content-type validation in /api/upload.
 * These tests prove that a file with a mismatched extension/content is rejected
 * with 400, and that a correctly-typed file passes through.
 *
 * Key falsifiable assertion: remove `verifyImageMagicBytes` call from the route
 * and the "PNG body with .jpg extension" test must fail with a 200 instead of 400.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Magic-byte helpers ───────────────────────────────────────────────────────

function pngBytes(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
}

function jpegBytes(): Buffer {
  return Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
}

function gifBytes(): Buffer {
  // GIF89a
  return Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00]);
}

function webpBytes(): Buffer {
  // RIFF????WEBP
  const b = Buffer.alloc(12);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(4, 4);
  b.write('WEBP', 8, 'ascii');
  return b;
}

// ── verifyImageMagicBytes unit tests ────────────────────────────────────────

import { verifyImageMagicBytes } from '../lib/upload/sniff';

describe('verifyImageMagicBytes', () => {
  it('accepts a JPEG body with .jpg extension', () => {
    const result = verifyImageMagicBytes(jpegBytes(), 'jpg');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mime).toBe('image/jpeg');
  });

  it('accepts a JPEG body with .jpeg extension', () => {
    const result = verifyImageMagicBytes(jpegBytes(), 'jpeg');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mime).toBe('image/jpeg');
  });

  it('accepts a PNG body with .png extension', () => {
    const result = verifyImageMagicBytes(pngBytes(), 'png');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mime).toBe('image/png');
  });

  it('accepts a GIF body with .gif extension', () => {
    const result = verifyImageMagicBytes(gifBytes(), 'gif');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mime).toBe('image/gif');
  });

  it('accepts a WebP body with .webp extension', () => {
    const result = verifyImageMagicBytes(webpBytes(), 'webp');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mime).toBe('image/webp');
  });

  it('rejects a PNG body with .jpg extension', () => {
    const result = verifyImageMagicBytes(pngBytes(), 'jpg');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('bad_content_type');
  });

  it('rejects a JPEG body with .png extension', () => {
    const result = verifyImageMagicBytes(jpegBytes(), 'png');
    expect(result.ok).toBe(false);
  });

  it('rejects a WebP body with .jpg extension', () => {
    const result = verifyImageMagicBytes(webpBytes(), 'jpg');
    expect(result.ok).toBe(false);
  });

  it('rejects a GIF body with .png extension', () => {
    const result = verifyImageMagicBytes(gifBytes(), 'png');
    expect(result.ok).toBe(false);
  });

  it('rejects a buffer with an unrecognized extension', () => {
    const result = verifyImageMagicBytes(jpegBytes(), 'bmp');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('unsupported_extension');
  });

  it('rejects a random byte sequence (no known signature)', () => {
    const random = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B]);
    const result = verifyImageMagicBytes(random, 'jpg');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('bad_content_type');
  });

  it('handles still WebP and animated WebP identically (same RIFF/WEBP header)', () => {
    // Both still and animated WebP start with RIFF????WEBP
    const still = webpBytes();
    const animated = Buffer.concat([webpBytes(), Buffer.from([0x41, 0x4E, 0x49, 0x4D])]);
    expect(verifyImageMagicBytes(still, 'webp').ok).toBe(true);
    expect(verifyImageMagicBytes(animated, 'webp').ok).toBe(true);
  });

  it('rejects a buffer shorter than 4 bytes', () => {
    const short = Buffer.from([0x89, 0x50]);
    const result = verifyImageMagicBytes(short, 'png');
    expect(result.ok).toBe(false);
  });
});

// ── Route integration: POST /api/upload ─────────────────────────────────────

vi.mock('@/lib/auth/household', () => ({
  requireHousehold: vi.fn().mockResolvedValue({
    household: { id: 'hh-1' },
    // role added 2026-05-06 per Circle/invite/role audit — /api/upload now
    // gates kid uploads on viewer.role === 'keeper'.
    user: { id: 'u-1', role: 'keeper' },
  }),
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn().mockReturnValue({ limited: false, remaining: 29, reset: 0 }),
  rateLimitResponse: vi.fn().mockReturnValue(null),
}));

const mockPut = vi.fn().mockResolvedValue({ url: 'https://blob.vercel-storage.com/private/covey/hh-1/user-u-1.jpg' });
vi.mock('@vercel/blob', () => ({ put: mockPut }));

const mockDbUpdate = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) });
vi.mock('@/lib/db', () => ({
  db: { update: mockDbUpdate },
}));
vi.mock('@/lib/db/schema', () => ({
  users: 'users_table',
  chicks: 'kids_table',
}));

function makeFormData(bodyBytes: Buffer, filename: string, mimeType: string, targetType = 'user', targetId = 'u-1'): FormData {
  const file = new File([bodyBytes], filename, { type: mimeType });
  const fd = new FormData();
  fd.append('file', file);
  fd.append('type', targetType);
  fd.append('id', targetId);
  return fd;
}

async function callUploadRoute(fd: FormData) {
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
  const { POST } = await import('../app/api/upload/route');
  const req = new Request('http://localhost/api/upload', {
    method: 'POST',
    body: fd,
  });
  return POST(req as never);
}

describe('POST /api/upload — magic-byte gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPut.mockResolvedValue({ url: 'https://blob.vercel-storage.com/private/covey/hh-1/user-u-1.jpg' });
    mockDbUpdate.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) });
  });

  it('returns 400 when PNG body is uploaded with .jpg extension', async () => {
    const fd = makeFormData(pngBytes(), 'photo.jpg', 'image/jpeg');
    const res = await callUploadRoute(fd);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad_content_type');
    // Blob.put must NOT be called — validation fires before storage
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('returns 200 when JPEG body is uploaded with .jpg extension', async () => {
    const fd = makeFormData(jpegBytes(), 'photo.jpg', 'image/jpeg');
    const res = await callUploadRoute(fd);
    expect(res.status).toBe(200);
  });

  it('uses verified MIME (not file.type) as contentType in blob.put', async () => {
    // Client claims image/png but sends JPEG bytes — should be caught
    const fd = makeFormData(jpegBytes(), 'photo.jpg', 'image/png');
    // ext is .jpg → verified as JPEG → mime = image/jpeg
    const res = await callUploadRoute(fd);
    expect(res.status).toBe(200);
    expect(mockPut).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'image/jpeg' })
    );
  });

  it('uploads with access: private (not public)', async () => {
    const fd = makeFormData(jpegBytes(), 'photo.jpg', 'image/jpeg');
    await callUploadRoute(fd);
    expect(mockPut).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      expect.objectContaining({ access: 'private' })
    );
  });

  it('returns /api/photo/[id] proxy path in response, not raw blob URL', async () => {
    // targetId must equal caller.user.id ('u-1') after the audit's auth gate.
    const fd = makeFormData(jpegBytes(), 'photo.jpg', 'image/jpeg', 'user', 'u-1');
    const res = await callUploadRoute(fd);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('/api/photo/u-1');
  });
});
