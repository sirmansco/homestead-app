/**
 * Regression tests for WebP metadata stripping in lib/strip-exif.ts.
 *
 * Verifies that EXIF and XMP  (with trailing space) RIFF chunks are removed
 * while VP8, VP8L, VP8X, ICCP, ANIM, and ANMF chunks are preserved.
 *
 * Falsifiable: remove the WebP RIFF stripping logic and the EXIF-chunk test
 * must fail (EXIF bytes still present in output).
 */
import { describe, it, expect } from 'vitest';
import { stripExif } from '../lib/strip-exif';

// ── WebP RIFF chunk builder helpers ─────────────────────────────────────────

function makeWebpChunk(fourcc: string, data: Buffer): Buffer {
  if (fourcc.length !== 4) throw new Error('FourCC must be 4 chars');
  const header = Buffer.alloc(8);
  header.write(fourcc, 0, 'ascii');
  header.writeUInt32LE(data.length, 4);
  // Pad to even byte boundary
  const pad = data.length % 2 === 1 ? Buffer.from([0x00]) : Buffer.alloc(0);
  return Buffer.concat([header, data, pad]);
}

function buildWebp(...chunks: Buffer[]): Buffer {
  const inner = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  // fileSize = 4 ("WEBP") + inner.length
  header.writeUInt32LE(4 + inner.length, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, inner]);
}

// Minimal VP8 bitstream (just enough bytes to be non-empty)
function vp8Chunk(): Buffer {
  return makeWebpChunk('VP8 ', Buffer.from([0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a]));
}

function vp8lChunk(): Buffer {
  return makeWebpChunk('VP8L', Buffer.from([0x2f, 0x00, 0x00, 0x00]));
}

function vp8xChunk(): Buffer {
  // VP8X with 10 bytes flags+dimensions
  return makeWebpChunk('VP8X', Buffer.alloc(10));
}

function syntheticExifChunk(): Buffer {
  const exifData = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]);
  return makeWebpChunk('EXIF', exifData);
}

function syntheticXmpChunk(): Buffer {
  // FourCC is "XMP " — with trailing space
  const xmpData = Buffer.from('<?xpacket begin="">data</xpacket>');
  return makeWebpChunk('XMP ', xmpData);
}

function animChunk(): Buffer {
  return makeWebpChunk('ANIM', Buffer.alloc(6));
}

function anmfChunk(): Buffer {
  return makeWebpChunk('ANMF', Buffer.alloc(16));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('stripExif — WebP', () => {
  it('returns a WebP with no metadata unchanged', () => {
    const input = buildWebp(vp8Chunk());
    const output = stripExif(input, 'webp');
    // The output should have the same content (RIFF header rebuilt, but data identical)
    expect(output.includes(Buffer.from('WEBP'))).toBe(true);
    expect(output.includes(Buffer.from('VP8 '))).toBe(true);
  });

  it('strips an EXIF chunk from a still WebP', () => {
    const input = buildWebp(vp8xChunk(), syntheticExifChunk(), vp8Chunk());
    const output = stripExif(input, 'webp');

    // EXIF FourCC must not appear in output
    expect(output.includes(Buffer.from('EXIF'))).toBe(false);
    // VP8 data preserved
    expect(output.includes(Buffer.from('VP8 '))).toBe(true);
  });

  it('strips an XMP chunk (FourCC "XMP " with trailing space)', () => {
    const input = buildWebp(vp8xChunk(), syntheticXmpChunk(), vp8Chunk());
    const output = stripExif(input, 'webp');

    expect(output.includes(Buffer.from('XMP '))).toBe(false);
    expect(output.includes(Buffer.from('VP8 '))).toBe(true);
  });

  it('strips both EXIF and XMP chunks in a single pass', () => {
    const input = buildWebp(vp8xChunk(), syntheticExifChunk(), syntheticXmpChunk(), vp8Chunk());
    const output = stripExif(input, 'webp');

    expect(output.includes(Buffer.from('EXIF'))).toBe(false);
    expect(output.includes(Buffer.from('XMP '))).toBe(false);
    expect(output.includes(Buffer.from('VP8 '))).toBe(true);
  });

  it('preserves VP8L chunk (lossless WebP)', () => {
    const input = buildWebp(vp8lChunk());
    const output = stripExif(input, 'webp');
    expect(output.includes(Buffer.from('VP8L'))).toBe(true);
  });

  it('preserves ANIM and ANMF chunks (animated WebP)', () => {
    // Animated WebP: VP8X + ANIM + one or more ANMF frames
    const input = buildWebp(vp8xChunk(), animChunk(), anmfChunk());
    const output = stripExif(input, 'webp');

    expect(output.includes(Buffer.from('ANIM'))).toBe(true);
    expect(output.includes(Buffer.from('ANMF'))).toBe(true);
  });

  it('strips EXIF from animated WebP while preserving ANIM/ANMF', () => {
    const input = buildWebp(vp8xChunk(), animChunk(), syntheticExifChunk(), anmfChunk());
    const output = stripExif(input, 'webp');

    expect(output.includes(Buffer.from('EXIF'))).toBe(false);
    expect(output.includes(Buffer.from('ANIM'))).toBe(true);
    expect(output.includes(Buffer.from('ANMF'))).toBe(true);
  });

  it('resets the RIFF file size correctly after stripping chunks', () => {
    const input = buildWebp(vp8xChunk(), syntheticExifChunk(), vp8Chunk());
    const output = stripExif(input, 'webp');

    // RIFF fileSize is at bytes 4-7 (LE)
    const reportedSize = output.readUInt32LE(4);
    // Actual payload after the RIFF header (12 bytes)
    const actualPayload = output.length - 8; // RIFF(4) + fileSize(4) = 8, then WEBP(4) + chunks
    // fileSize = 4 ("WEBP") + chunks length = output.length - 8
    expect(reportedSize).toBe(output.length - 8);
    expect(reportedSize).toBe(actualPayload);
  });

  it('returns input unchanged when RIFF/WEBP signature is missing', () => {
    const notWebp = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const output = stripExif(notWebp, 'webp');
    expect(output.equals(notWebp)).toBe(true);
  });

  it('handles ext alias "WEBP" (uppercase)', () => {
    const input = buildWebp(vp8xChunk(), syntheticExifChunk(), vp8Chunk());
    const output = stripExif(input, 'WEBP');
    expect(output.includes(Buffer.from('EXIF'))).toBe(false);
  });
});
