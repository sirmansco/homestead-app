/**
 * Minimal EXIF/metadata stripper for JPEG, PNG, and WebP.
 *
 * JPEG structure:
 *   SOI (0xFFD8)
 *   [APPn markers — APP0 JFIF, APP1 EXIF, APP2 ICC, etc.]
 *   ...image data...
 *   EOI (0xFFD9)
 *
 * We remove APP1 (EXIF, which includes GPS coords) and APP13 (IPTC/Photoshop).
 * We keep APP0 (JFIF) and APP2 (ICC color profile) so the image still renders
 * correctly. Anything else is preserved.
 *
 * PNG structure:
 *   8-byte signature + sequence of chunks (4-byte length, 4-byte type, data, 4-byte CRC).
 *   We remove tEXt, iTXt, zTXt (text metadata), and eXIf (EXIF block).
 *   We preserve image-critical chunks: IHDR, IDAT, IEND, PLTE, tRNS, and all
 *   color-management chunks (gAMA, cHRM, sRGB, iCCP, sBIT, hIST, pHYs, sPLT,
 *   bKGD, tIME, and any ancillary chunk not on the strip list).
 *
 * WebP structure (RIFF container):
 *   4 bytes "RIFF", 4-byte file size (LE), 4 bytes "WEBP", then RIFF chunks.
 *   Each chunk: 4-byte FourCC, 4-byte size (LE), data (padded to even length).
 *   We remove EXIF and XMP  (note trailing space in "XMP ") chunks.
 *   We preserve VP8, VP8L, VP8X, ICCP, ALPH, ANIM, ANMF.
 *
 * GIF: GIF metadata is minimal (plain-text extensions are rare in camera output
 * and don't carry GPS). We pass GIF through unchanged and document why here so
 * this decision is visible rather than implicit.
 *
 * Returns a new Buffer. Input buffer is not modified.
 */
export function stripExif(input: Buffer, mimeOrExt: string): Buffer {
  const lower = mimeOrExt.toLowerCase();

  if (/jpe?g/.test(lower)) return stripJpeg(input);
  if (/png/.test(lower)) return stripPng(input);
  if (/webp/.test(lower)) return stripWebp(input);

  // GIF and unknown — pass through unchanged
  return input;
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------
function stripJpeg(input: Buffer): Buffer {
  // JPEG must start with SOI marker
  if (input.length < 4 || input[0] !== 0xFF || input[1] !== 0xD8) return input;

  const out: number[] = [0xFF, 0xD8];
  let i = 2;

  while (i < input.length - 1) {
    if (input[i] !== 0xFF) {
      // Fallback: something unexpected — copy rest verbatim
      for (let j = i; j < input.length; j++) out.push(input[j]);
      break;
    }
    const marker = input[i + 1];

    // Start-of-scan (SOS, 0xDA) — after this the rest is compressed image data
    // up to EOI. Copy everything.
    if (marker === 0xDA) {
      for (let j = i; j < input.length; j++) out.push(input[j]);
      break;
    }

    // Standalone markers with no length field
    if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) {
      out.push(0xFF, marker);
      i += 2;
      continue;
    }

    // Marker with 2-byte length (big-endian) that includes the length bytes
    if (i + 3 >= input.length) break;
    const segLen = (input[i + 2] << 8) | input[i + 3];
    const segEnd = i + 2 + segLen;

    // Strip APP1 (EXIF) and APP13 (IPTC). APP1 = 0xE1, APP13 = 0xED.
    const shouldStrip = marker === 0xE1 || marker === 0xED;

    if (!shouldStrip) {
      for (let j = i; j < segEnd; j++) out.push(input[j]);
    }
    i = segEnd;
  }

  return Buffer.from(out);
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------
// Chunk types to remove (text metadata and EXIF block)
const PNG_STRIP = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf']);

function stripPng(input: Buffer): Buffer {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (input.length < 8) return input;
  const sig = input.slice(0, 8);
  const expected = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (!sig.equals(expected)) return input;

  const chunks: Buffer[] = [sig];
  let i = 8;

  while (i + 12 <= input.length) {
    const dataLen = input.readUInt32BE(i);         // chunk data length
    const typeBytes = input.slice(i + 4, i + 8);  // chunk type (4 ASCII chars)
    const type = typeBytes.toString('ascii');
    const totalChunkLen = 4 + 4 + dataLen + 4;    // length + type + data + CRC

    if (i + totalChunkLen > input.length) {
      // Truncated chunk — copy remainder and stop
      chunks.push(input.slice(i));
      break;
    }

    if (!PNG_STRIP.has(type)) {
      chunks.push(input.slice(i, i + totalChunkLen));
    }

    i += totalChunkLen;

    // Stop after IEND
    if (type === 'IEND') break;
  }

  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// WebP
// ---------------------------------------------------------------------------
// RIFF chunk FourCCs to remove (EXIF and XMP metadata)
// Note: "XMP " has a trailing space — that is the actual FourCC.
const WEBP_STRIP = new Set(['EXIF', 'XMP ']);

function stripWebp(input: Buffer): Buffer {
  // WebP: RIFF (4) + fileSize (4 LE) + WEBP (4) = 12 bytes minimum
  if (input.length < 12) return input;
  if (
    input[0] !== 0x52 || input[1] !== 0x49 || input[2] !== 0x46 || input[3] !== 0x46 ||
    input[8] !== 0x57 || input[9] !== 0x45 || input[10] !== 0x42 || input[11] !== 0x50
  ) return input;

  // We'll rebuild the file, so accumulate kept chunks then fix the file size.
  const kept: Buffer[] = [];
  let i = 12; // start of first RIFF chunk after "WEBP"

  while (i + 8 <= input.length) {
    const fourcc = input.slice(i, i + 4).toString('ascii');
    const chunkSize = input.readUInt32LE(i + 4);
    // RIFF chunks are padded to even byte boundaries
    const paddedSize = chunkSize + (chunkSize % 2 === 1 ? 1 : 0);
    const chunkTotal = 8 + paddedSize; // fourcc(4) + size(4) + data(paddedSize)

    if (i + chunkTotal > input.length) {
      // Truncated chunk — keep remainder verbatim
      kept.push(input.slice(i));
      break;
    }

    if (!WEBP_STRIP.has(fourcc)) {
      kept.push(input.slice(i, i + chunkTotal));
    }

    i += chunkTotal;
  }

  // Rebuild: RIFF header + WEBP + kept chunks
  const keptBuf = Buffer.concat(kept);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  // fileSize = 4 ("WEBP") + keptBuf.length
  header.writeUInt32LE(4 + keptBuf.length, 4);
  header.write('WEBP', 8, 'ascii');

  return Buffer.concat([header, keptBuf]);
}
