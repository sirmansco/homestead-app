import { describe, it, expect } from 'vitest';
import { stripExif } from '../lib/strip-exif';

function hex(...bytes: number[]) { return Buffer.from(bytes); }

describe('stripExif', () => {
  it('returns non-JPEG input unchanged', () => {
    const png = hex(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00);
    expect(stripExif(png, 'png').equals(png)).toBe(true);
  });

  it('returns JPEG unchanged when no APP1/APP13 present', () => {
    // SOI + APP0 (JFIF) + SOS + data + EOI
    const jpeg = hex(
      0xFF, 0xD8,             // SOI
      0xFF, 0xE0, 0x00, 0x04, 0x4A, 0x46,  // APP0 length 4 payload
      0xFF, 0xDA, 0x00, 0x02, // SOS length 2 (minimal)
      0x00, 0x00,             // image data
      0xFF, 0xD9,             // EOI
    );
    const out = stripExif(jpeg, 'jpg');
    expect(out.equals(jpeg)).toBe(true);
  });

  it('strips APP1 (EXIF) segment', () => {
    const jpeg = hex(
      0xFF, 0xD8,             // SOI
      0xFF, 0xE1, 0x00, 0x06, // APP1 length 6
      0x45, 0x78, 0x69, 0x66, // "Exif"
      0xFF, 0xE0, 0x00, 0x04, 0x4A, 0x46, // APP0 (kept)
      0xFF, 0xDA, 0x00, 0x02, // SOS
      0x00, 0x00,             // image data
      0xFF, 0xD9,             // EOI
    );
    const out = stripExif(jpeg, 'jpg');
    // APP1 "Exif" bytes should not be present
    const hasExifMarker = out.includes(Buffer.from('Exif'));
    expect(hasExifMarker).toBe(false);
    // APP0 JFIF should still be present
    expect(out[0]).toBe(0xFF);
    expect(out[1]).toBe(0xD8);
    expect(out.includes(Buffer.from([0xFF, 0xE0]))).toBe(true);
    // EOI preserved
    expect(out[out.length - 2]).toBe(0xFF);
    expect(out[out.length - 1]).toBe(0xD9);
  });

  it('strips APP13 (IPTC/Photoshop) segment', () => {
    const jpeg = hex(
      0xFF, 0xD8,
      0xFF, 0xED, 0x00, 0x06, 0x50, 0x68, 0x6F, 0x74, // APP13 "Phot"
      0xFF, 0xDA, 0x00, 0x02,
      0x00,
      0xFF, 0xD9,
    );
    const out = stripExif(jpeg, 'jpg');
    expect(out.includes(Buffer.from([0xFF, 0xED]))).toBe(false);
  });

  it('returns input unchanged if JPEG is malformed', () => {
    const malformed = hex(0xFF, 0xD9); // EOI with no SOI
    const out = stripExif(malformed, 'jpg');
    expect(out.equals(malformed)).toBe(true);
  });

  it('does not break when called on an empty buffer', () => {
    const empty = Buffer.alloc(0);
    const out = stripExif(empty, 'jpg');
    expect(out.length).toBe(0);
  });
});
