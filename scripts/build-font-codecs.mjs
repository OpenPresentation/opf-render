import {readFile, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

/** Reviewed adapter of the pinned Google-derived table reconstruction code.
 * Replace its async/unbounded native Brotli wrapper with the bounded synchronous
 * decoder. Keep this build-time dependency out of consumers' dependency graphs.
 */
export async function buildFontCodecs(root, dist) {
  const entry = import.meta.resolve('woff-lib/woff2/decode');
  const source = await readFile(new URL(entry), 'utf8');
  const hash = createHash('sha256').update(source).digest('hex');
  if (hash !== '4b0b4dc6e7486560638f0bb16426cb14cf3b8bbeaeb895942ea8e2f7fa87f919')
    throw new Error('Review the pinned woff-lib decoder before changing its adapter.');
  let adapted = source.slice(source.indexOf('//#region src/woff2/decode/buffer.ts'));
  const replace = (before, after) => {
    if (adapted.split(before).length !== 2) throw new Error(`WOFF2 adapter marker changed: ${before.slice(0, 70)}`);
    adapted = adapted.replace(before, after);
  };
  replace('async function woff2Decode(data)', 'function woff2Decode(data, maxBytes = 67108864)');
  replace('const decompressed = await decompress(input.subarray(header.compressedOffset, header.compressedOffset + header.compressedLength));', `
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 0xffffffff) throw new Error('Invalid font byte limit');
  if (header.compressedOffset + header.compressedLength > input.length) throw new Error('Truncated WOFF2 Brotli stream');
  const predictedSize = computeOffsetToFirstTable(header) + header.tables.reduce((size, table) => size + Math.ceil(table.origLength / 4) * 4, 0);
  if (predictedSize > maxBytes || header.uncompressedSize > maxBytes) throw Object.assign(new Error('WOFF2 preparation exceeds the configured byte limit'), {code:'font-size-limit'});
  const decompressed = brotliDecode(input.subarray(header.compressedOffset, header.compressedOffset + header.compressedLength), {maxOutputSize:header.uncompressedSize});`);
  // Bound reconstruction buffers too. SFNT simple-glyph endpoint indices are
  // uint16; accepting more points would both allocate excessively and wrap IDs.
  replace('reconstructGlyf(decompressed, glyfTable, locaTable, fontInfo)', 'reconstructGlyf(decompressed, glyfTable, locaTable, fontInfo, output.length)');
  replace('function reconstructGlyf(data, glyfTable, _locaTable, fontInfo)', 'function reconstructGlyf(data, glyfTable, _locaTable, fontInfo, maxBytes)');
  replace('let glyfOutput = new Uint8Array(glyfTable.origLength * 2);', 'let glyfOutput = new Uint8Array(Math.min(maxBytes, glyfTable.origLength * 2));');
  replace('const scratchSize = totalPoints * 2;', "if (totalPoints > 65536) throw new Error('Invalid glyph point count');\n\t\t\tconst scratchSize = totalPoints * 2;");
  replace('const newOutput = new Uint8Array((glyfOffset + needed) * 2);', "if (glyfOffset + needed > maxBytes) throw Object.assign(new Error('WOFF2 glyph reconstruction exceeds the byte limit'), {code:'font-size-limit'});\n\t\t\tconst newOutput = new Uint8Array(Math.min(maxBytes, (glyfOffset + needed) * 2));");
  replace('function makeByteStream(data, start, length) {', "function makeByteStream(data, start, length) {\n  if (start < 0 || length < 0 || start + length > data.length) throw new Error('Invalid transformed table stream bounds');");
  replace('if (!buf.skip(2)) return null;', 'if (buf.readU16() !== 0) return null;');
  replace('const xformVersion = flagByte >> 6 & 3;', `const xformVersion = flagByte >> 6 & 3;
    if ((tag === TAG_GLYF || tag === TAG_LOCA) ? ![0,3].includes(xformVersion) : tag === TAG_HMTX ? ![0,1].includes(xformVersion) : xformVersion !== 0) return null;`);
  replace('const nContours = bsReadS16(nContourStream);', "const nContours = bsReadS16(nContourStream);\n    if (nContours < -1) throw new Error('Invalid glyph contour count');");
  await build({stdin:{contents:`import {brotliDecode} from 'brotli-lib/decode';\n${adapted}`,resolveDir:fileURLToPath(root)},
    bundle:true,platform:'browser',format:'esm',target:'es2022',minifySyntax:true,
    banner:{js:`// Generated from woff-lib 0.0.3 (${hash}); bounded synchronous adapter in scripts/build-font-codecs.mjs. See bundled WOFF2 and Brotli licenses.`},
    outfile:fileURLToPath(new URL('font-woff2.js', dist))});
  for (const [name, location] of [['WOFF2', new URL('../', entry)], ['Brotli', new URL('../', import.meta.resolve('brotli-lib/decode'))]])
    for (const license of ['LICENSE', 'LICENSE_THIRD_PARTY'])
      await copyFile(new URL(license, location), new URL(`${name}-${license}`, dist));
}
