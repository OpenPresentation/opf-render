import assert from 'node:assert/strict';
import {brotliCompressSync,constants} from 'node:zlib';
import {fontTables} from './font-container-fixtures.mjs';

const base128=value=>{const bytes=[value&127];while((value=Math.floor(value/128)))bytes.unshift((value&127)|128);return Buffer.from(bytes);};
/** Encode metrics from independently read original TrueType table bytes. */
export function transformHmtx(tables,flags=3) {
  const n=tables.get('maxp').readUInt16BE(4),m=tables.get('hhea').readUInt16BE(34);
  const original=tables.get('hmtx'),glyf=tables.get('glyf'),loca=tables.get('loca');
  const stride=tables.get('head').readInt16BE(50)?4:2;
  const offset=index=>stride===4?loca.readUInt32BE(index*4):loca.readUInt16BE(index*2)*2;
  const advances=Buffer.alloc(m*2),proportional=Buffer.alloc(m*2),monospace=Buffer.alloc((n-m)*2);
  for(let index=0;index<n;index++) {
    const left=index<m?original.readInt16BE(index*4+2):original.readInt16BE(m*4+(index-m)*2);
    const start=offset(index),end=offset(index+1),xMin=start===end?0:glyf.readInt16BE(start+2);
    if((index<m?flags&1:flags&2))assert.equal(left,xMin,'Transform only matching glyph bearings, including empty glyphs');
    if(index<m){advances.writeUInt16BE(original.readUInt16BE(index*4),index*2);proportional.writeInt16BE(left,index*2);}
    else monospace.writeInt16BE(left,(index-m)*2);
  }
  return Buffer.concat([Buffer.from([flags]),advances,...(flags&1?[]:[proportional]),...(flags&2?[]:[monospace])]);
}
/** WOFF2 with literal glyph/loca tables and the optional hmtx transform. */
export function makeWoff2Hmtx(font, flags=3, {editTables,editMetrics}={}) {
  const tables=fontTables(font),n=tables.get('maxp').readUInt16BE(4),m=tables.get('hhea').readUInt16BE(34);
  let transformed=transformHmtx(tables,flags);
  editTables?.(tables);
  if(editMetrics)transformed=editMetrics(transformed);
  const directory=[],payload=[];
  let sfntSize=12;
  tables.delete('DSIG');
  for(const [tag,bytes]of tables) {
    const hmtx=tag==='hmtx';
    const tagHeader=tag==='glyf'?Buffer.from([202]):tag==='loca'?Buffer.from([203]):hmtx?Buffer.from([67]):Buffer.concat([Buffer.from([63]),Buffer.from(tag)]);
    directory.push(tagHeader,base128(bytes.length),...(hmtx?[base128(transformed.length)]:[]));
    payload.push(hmtx?transformed:bytes);sfntSize+=16+Math.ceil(bytes.length/4)*4;
  }
  const compressed=brotliCompressSync(Buffer.concat(payload),{params:{[constants.BROTLI_PARAM_QUALITY]:4}}),records=Buffer.concat(directory);
  const metadata=Buffer.from('<?xml version="1.0"?><metadata version="1.0"><uniqueid id="opf-hmtx-fixture"/></metadata>');
  const compressedMetadata=brotliCompressSync(metadata),privateData=Buffer.from('OPF private wrapper sentinel');
  const metadataOffset=Math.ceil((48+records.length+compressed.length)/4)*4;
  const privateOffset=Math.ceil((metadataOffset+compressedMetadata.length)/4)*4;
  const result=Buffer.alloc(privateOffset+privateData.length);
  result.write('wOF2');font.copy(result,4,0,4);result.writeUInt32BE(result.length,8);result.writeUInt16BE(tables.size,12);
  result.writeUInt32BE(sfntSize,16);result.writeUInt32BE(compressed.length,20);records.copy(result,48);compressed.copy(result,48+records.length);
  result.writeUInt32BE(metadataOffset,28);result.writeUInt32BE(compressedMetadata.length,32);result.writeUInt32BE(metadata.length,36);
  result.writeUInt32BE(privateOffset,40);result.writeUInt32BE(privateData.length,44);
  compressedMetadata.copy(result,metadataOffset);privateData.copy(result,privateOffset);
  return {data:result,numGlyphs:n,numHMetrics:m,flags};
}
