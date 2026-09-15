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
  const headerSize = computeOffsetToFirstTable(header);
  if (headerSize > maxBytes || header.uncompressedSize > maxBytes) throw Object.assign(new Error('WOFF2 preparation exceeds the configured byte limit'), {code:'font-size-limit'});
  const decompressed = brotliDecode(input.subarray(header.compressedOffset, header.compressedOffset + header.compressedLength), {maxOutputSize:header.uncompressedSize});`);
  const allocationStart=adapted.indexOf('\tlet outputSize = computeOffsetToFirstTable(header);');
  const allocationEnd=adapted.indexOf('\nfunction readHeader',allocationStart);
  if(allocationStart<0||allocationEnd<0)throw new Error('WOFF2 output allocation marker changed');
  // origLength for transformed glyf is advisory, not an allocation contract
  // (WOFF2 sections 4.1 and 5.1). Grow from actual reconstructed output, with
  // a hard configured limit, without requiring resizable ArrayBuffer support.
  adapted=adapted.slice(0,allocationStart)+`
  const writer={data:new Uint8Array(Math.max(headerSize, Math.min(65536, maxBytes))),maxBytes};
  header.requiresSfntEmbedding=false;
  writer.view=new DataView(writer.data.buffer);
  const fontInfos=writeHeaders(header,writer.data,writer.view);
  const writtenTables=new Map();
  let nextTableOffset=headerSize;
  const count=Math.max(1,header.ttcFonts.length);
  for(let index=0;index<count;index++)nextTableOffset=reconstructFont(decompressed,header,index,fontInfos[index],writer,writtenTables,nextTableOffset);
  return {data:writer.data.slice(0,nextTableOffset),requiresSfntEmbedding:header.requiresSfntEmbedding};
}
`+adapted.slice(allocationEnd);
  replace('function reconstructFont(decompressed, header, fontIndex, fontInfo, output, outView, writtenTables, dstOffset) {', `function reconstructFont(decompressed, header, fontIndex, fontInfo, writer, writtenTables, dstOffset) {
  let output=writer.data,outView=writer.view;
  const ensureOutput=length=>{
    if(length>writer.maxBytes)throw Object.assign(new Error('WOFF2 reconstructed font exceeds the byte limit'),{code:'font-size-limit'});
    if(length>output.length){
      const grown=new Uint8Array(Math.min(writer.maxBytes,Math.max(length,output.length*2)));
      grown.set(output);writer.data=output=grown;writer.view=outView=new DataView(grown.buffer);
    }
  };`);
  const outputWrites=adapted.match(/output\.set\((tableData|result\.locaData), dstOffset\);/g);
  if(outputWrites?.length!==3)throw new Error('WOFF2 output write sites changed');
  adapted=adapted.replace(/output\.set\((tableData|result\.locaData), dstOffset\);/g, 'ensureOutput(pad4(dstOffset + $1.length)); output.set($1, dstOffset);');
  replace('let fontChecksum = header.ttcFonts.length > 0 ? header.ttcFonts[fontIndex].headerChecksum : 0;', `
  if(prepareHmtxMetrics(decompressed,sortedTables,fontInfo,WOFF2_FLAGS_TRANSFORM))header.requiresSfntEmbedding=true;
  let fontChecksum = header.ttcFonts.length > 0 ? header.ttcFonts[fontIndex].headerChecksum : 0;`);
  // Bound reconstruction buffers too. SFNT simple-glyph endpoint indices are
  // uint16; accepting more points would both allocate excessively and wrap IDs.
  replace('reconstructGlyf(decompressed, glyfTable, locaTable, fontInfo)', 'reconstructGlyf(decompressed, glyfTable, locaTable, fontInfo, writer.maxBytes)');
  replace('function reconstructGlyf(data, glyfTable, _locaTable, fontInfo)', 'function reconstructGlyf(data, glyfTable, _locaTable, fontInfo, maxBytes)');
  replace('let glyfOutput = new Uint8Array(glyfTable.origLength * 2);', 'let glyfOutput = new Uint8Array(Math.min(maxBytes, Math.max(256,glyfTable.transformLength)));');
  replace('const scratchSize = totalPoints * 2;', "if (totalPoints > 65536) throw new Error('Invalid glyph point count');\n\t\t\tconst scratchSize = totalPoints * 2;");
  replace('const newOutput = new Uint8Array((glyfOffset + needed) * 2);', "if (glyfOffset + needed > maxBytes) throw Object.assign(new Error('WOFF2 glyph reconstruction exceeds the byte limit'), {code:'font-size-limit'});\n\t\t\tconst newOutput = new Uint8Array(Math.min(maxBytes, (glyfOffset + needed) * 2));");
  replace('function makeByteStream(data, start, length) {', "function makeByteStream(data, start, length) {\n  if (start < 0 || length < 0 || start + length > data.length) throw new Error('Invalid transformed table stream bounds');");
  replace('if (!buf.skip(2)) return null;', 'if (buf.readU16() !== 0) return null;');
  replace('const xformVersion = flagByte >> 6 & 3;', `const xformVersion = flagByte >> 6 & 3;
    if ((tag === TAG_GLYF || tag === TAG_LOCA) ? ![0,3].includes(xformVersion) : tag === TAG_HMTX ? ![0,1].includes(xformVersion) : xformVersion !== 0) return null;`);
  replace('const nContours = bsReadS16(nContourStream);', "const nContours = bsReadS16(nContourStream);\n    if (nContours < -1) throw new Error('Invalid glyph contour count');");
  replace('const hmtxFlags = bsReadU8(hmtxStream);', `const hmtxFlags = bsReadU8(hmtxStream);
  if(hmtxFlags===0||(hmtxFlags&~3)!==0||numHMetrics<1||numHMetrics>numGlyphs||xMins.length!==numGlyphs)throw new Error('Invalid transformed hmtx flags or glyph/metric counts');`);
  replace('const outputSize = numHMetrics * 4 + (numGlyphs - numHMetrics) * 2;', `const outputSize = numHMetrics * 4 + (numGlyphs - numHMetrics) * 2;
  if(hmtxStream.pos!==hmtxStream.end||outputSize!==table.origLength)throw new Error('Invalid transformed hmtx length');`);
  await build({stdin:{contents:`import {brotliDecode} from 'brotli-lib/decode';\nimport {prepareHmtxMetrics} from './src/font-woff2-metrics.js';\n${adapted}`,resolveDir:fileURLToPath(root)},
    bundle:true,platform:'browser',format:'esm',target:'es2022',minifySyntax:true,
    banner:{js:`// Generated from woff-lib 0.0.3 (${hash}); bounded synchronous adapter in scripts/build-font-codecs.mjs. See bundled WOFF2 and Brotli licenses.`},
    outfile:fileURLToPath(new URL('font-woff2.js', dist))});
  for (const [name, location] of [['WOFF2', new URL('../', entry)], ['Brotli', new URL('../', import.meta.resolve('brotli-lib/decode'))]])
    for (const license of ['LICENSE', 'LICENSE_THIRD_PARTY'])
      await copyFile(new URL(license, location), new URL(`${name}-${license}`, dist));
}
