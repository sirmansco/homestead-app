/**
 * Magic-byte content-type verifier for uploaded image files.
 *
 * Reads the first 12 bytes of a buffer and compares against known signatures.
 * Returns the MIME type derived from the actual bytes (not the client-supplied
 * file.type), or a rejection reason if the bytes don't match the declared ext.
 *
 * Supported formats and their signatures:
 *   JPEG  — FF D8 FF
 *   PNG   — 89 50 4E 47 0D 0A 1A 0A
 *   GIF   — 47 49 46 38 (37|39) 61
 *   WebP  — 52 49 46 46 ?? ?? ?? ?? 57 45 42 50 (RIFF....WEBP)
 *   Animated WebP has the same RIFF/WEBP header; covered by the same check.
 */

export type SniffResult =
  | { ok: true; mime: string }
  | { ok: false; reason: string };

// Map file extension aliases to canonical groups
const EXT_TO_GROUP: Record<string, 'jpeg' | 'png' | 'gif' | 'webp'> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
};

const MIME: Record<'jpeg' | 'png' | 'gif' | 'webp', string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

function detectGroup(buf: Buffer): 'jpeg' | 'png' | 'gif' | 'webp' | null {
  if (buf.length < 4) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
    buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A) return 'png';

  // GIF: 47 49 46 38 (37|39) 61 → "GIF87a" or "GIF89a"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61) return 'gif';

  // WebP: RIFF????WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  if (buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp';

  return null;
}

/**
 * Verify that `buf`'s actual bytes match the declared file extension.
 * Returns the verified MIME type on success, or a rejection reason.
 */
export function verifyImageMagicBytes(buf: Buffer, ext: string): SniffResult {
  const normalizedExt = ext.toLowerCase();
  const declaredGroup = EXT_TO_GROUP[normalizedExt];

  if (!declaredGroup) {
    return { ok: false, reason: `unsupported_extension:${normalizedExt}` };
  }

  const detectedGroup = detectGroup(buf);

  if (!detectedGroup) {
    return { ok: false, reason: 'bad_content_type:unrecognized_signature' };
  }

  if (detectedGroup !== declaredGroup) {
    return {
      ok: false,
      reason: `bad_content_type:declared_${declaredGroup}_detected_${detectedGroup}`,
    };
  }

  return { ok: true, mime: MIME[detectedGroup] };
}
