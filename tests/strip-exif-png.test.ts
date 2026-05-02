/**
 * Regression tests for PNG metadata stripping in lib/strip-exif.ts.
 *
 * Verifies that tEXt, iTXt, zTXt, eXIf chunks are removed while IHDR, IDAT,
 * IEND, PLTE and other image-critical chunks are preserved.
 *
 * Falsifiable: remove the PNG_STRIP logic from stripExif and the
 * "GPS in tEXt chunk" test must fail (GPS bytes still present in output).
 */
import { describe, it, expect } from 'vitest';
import { stripExif } from '../lib/strip-exif';

// ── PNG chunk builder helpers ────────────────────────────────────────────────

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

function crc32(data: Buffer): number {
  // Simple CRC-32 used in PNG (polynomial 0xEDB88320)
  const table = (() => {
    const t: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c;
    }
    return t;
  })();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

function minimalIHDR(): Buffer {
  // 1×1 IHDR
  const data = Buffer.alloc(13);
  data.writeUInt32BE(1, 0); // width
  data.writeUInt32BE(1, 4); // height
  data[8] = 8;              // bit depth
  data[9] = 2;              // color type: RGB
  return makeChunk('IHDR', data);
}

function minimalIDAT(): Buffer {
  return makeChunk('IDAT', Buffer.from([0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]));
}

function iendChunk(): Buffer {
  return makeChunk('IEND', Buffer.alloc(0));
}

function buildPng(...extraChunks: Buffer[]): Buffer {
  return Buffer.concat([PNG_SIG, minimalIHDR(), ...extraChunks, minimalIDAT(), iendChunk()]);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('stripExif — PNG', () => {
  it('returns PNG with no metadata unchanged (only IHDR/IDAT/IEND)', () => {
    const input = buildPng();
    const output = stripExif(input, 'png');
    expect(output.equals(input)).toBe(true);
  });

  it('strips a tEXt chunk containing synthetic GPS data', () => {
    const gpsData = Buffer.from('Comment\x00GPS: 37.7749,-122.4194');
    const tEXt = makeChunk('tEXt', gpsData);
    const input = buildPng(tEXt);
    const output = stripExif(input, 'png');

    // GPS text must not appear in output
    expect(output.includes(Buffer.from('GPS:'))).toBe(false);
    // IHDR must still be present
    expect(output.includes(Buffer.from('IHDR'))).toBe(true);
    // IEND must still be present
    expect(output.includes(Buffer.from('IEND'))).toBe(true);
  });

  it('strips an iTXt chunk (international text metadata)', () => {
    const iTXt = makeChunk('iTXt', Buffer.from('Author\x00\x00\x00\x00\x00John Doe'));
    const input = buildPng(iTXt);
    const output = stripExif(input, 'png');

    expect(output.includes(Buffer.from('iTXt'))).toBe(false);
    expect(output.includes(Buffer.from('IHDR'))).toBe(true);
  });

  it('strips a zTXt chunk (compressed text metadata)', () => {
    const zTXt = makeChunk('zTXt', Buffer.from('Software\x00\x00SomeCamera'));
    const input = buildPng(zTXt);
    const output = stripExif(input, 'png');

    expect(output.includes(Buffer.from('zTXt'))).toBe(false);
  });

  it('strips an eXIf chunk (EXIF data embedded in PNG)', () => {
    // Synthetic EXIF-like bytes
    const exifData = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00]);
    const eXIf = makeChunk('eXIf', exifData);
    const input = buildPng(eXIf);
    const output = stripExif(input, 'png');

    expect(output.includes(Buffer.from('eXIf'))).toBe(false);
  });

  it('preserves PLTE chunk (color palette)', () => {
    const plte = makeChunk('PLTE', Buffer.from([0xFF, 0x00, 0x00, 0x00, 0xFF, 0x00]));
    const input = buildPng(plte);
    const output = stripExif(input, 'png');

    expect(output.includes(Buffer.from('PLTE'))).toBe(true);
  });

  it('strips multiple metadata chunks in one pass', () => {
    const tEXt = makeChunk('tEXt', Buffer.from('GPS\x00loc:abc'));
    const iTXt = makeChunk('iTXt', Buffer.from('Author\x00\x00\x00\x00\x00Jane'));
    const input = buildPng(tEXt, iTXt);
    const output = stripExif(input, 'png');

    expect(output.includes(Buffer.from('tEXt'))).toBe(false);
    expect(output.includes(Buffer.from('iTXt'))).toBe(false);
    expect(output.includes(Buffer.from('IHDR'))).toBe(true);
    expect(output.includes(Buffer.from('IDAT'))).toBe(true);
    expect(output.includes(Buffer.from('IEND'))).toBe(true);
  });

  it('returns input unchanged when PNG signature is missing (not a PNG)', () => {
    const notPng = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const output = stripExif(notPng, 'png');
    expect(output.equals(notPng)).toBe(true);
  });

  it('handles ext alias "PNG" (uppercase)', () => {
    const tEXt = makeChunk('tEXt', Buffer.from('Comment\x00metadata'));
    const input = buildPng(tEXt);
    const output = stripExif(input, 'PNG');
    expect(output.includes(Buffer.from('tEXt'))).toBe(false);
  });
});
