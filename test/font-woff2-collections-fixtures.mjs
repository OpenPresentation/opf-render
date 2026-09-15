import assert from 'node:assert/strict';
import {brotliCompressSync,brotliDecompressSync,constants} from 'node:zlib';
import wawoff2 from 'wawoff2';
import {fontTables} from './font-container-fixtures.mjs';
import {transformHmtx} from './font-woff2-hmtx-fixtures.mjs';

const tags=['cmap','head','hhea','hmtx','maxp','name','OS/2','post','cvt ','fpgm','glyf','loca','prep','CFF ','VORG','EBDT','EBLC','gasp','hdmx','kern','LTSH','PCLT','VDMX','vhea','vmtx','BASE','GDEF','GPOS','GSUB','EBSC','JSTF','MATH','CBDT','CBLC','COLR','CPAL','SVG ','sbix','acnt','avar','bdat','bloc','bsln','cvar','fdsc','feat','fmtx','fvar','gvar','hsty','just','lcar','mort','morx','opbd','prop','trak','Zapf','Silf','Glat','Gloc','Feat','Sill'];
const align=value=>Math.ceil(value/4)*4;
const u16=value=>{const bytes=Buffer.alloc(2);bytes.writeUInt16BE(value);return bytes;};
const u32=value=>{const bytes=Buffer.alloc(4);bytes.writeUInt32BE(value);return bytes;};
const ushort=value=>value<253?Buffer.from([value]):Buffer.concat([Buffer.from([253]),u16(value)]);
const base128=value=>{const bytes=[value&127];while((value=Math.floor(value/128)))bytes.unshift((value&127)|128);return Buffer.from(bytes);};
const checksum=bytes=>{let result=0;for(let i=0;i<bytes.length;i+=4)result=(result+((bytes[i]<<24|(bytes[i+1]??0)<<16|(bytes[i+2]??0)<<8|(bytes[i+3]??0))>>>0))>>>0;return result;};

/** Independent test-only SFNT/TTC writer, sharing byte-identical table records. */
function makeSfntCollection(fonts,collection) {
  const all=[],faces=fonts.map(font=>{
    const entries=[...fontTables(font)].filter(([tag])=>tag!=='DSIG').sort(([a],[b])=>a<b?-1:a>b?1:0);
    return {flavor:font.readUInt32BE(0),tables:entries.map(([tag,bytes])=>{
      let table=all.find(item=>item.tag===tag&&item.bytes.equals(bytes));
      if(!table){table={tag,bytes};all.push(table);}return table;
    })};
  });
  let offset=collection?12+faces.length*4:0;
  for(const face of faces){face.offset=offset;offset+=12+face.tables.length*16;}
  for(const table of all){table.offset=offset;offset+=align(table.bytes.length);}
  const output=Buffer.alloc(offset);
  if(collection){output.write('ttcf');output.writeUInt32BE(0x10000,4);output.writeUInt32BE(faces.length,8);}
  for(const [index,face]of faces.entries()){
    if(collection)output.writeUInt32BE(face.offset,12+index*4);
    const n=face.tables.length,power=Math.floor(Math.log2(n)),start=face.offset;
    output.writeUInt32BE(face.flavor,start);output.writeUInt16BE(n,start+4);output.writeUInt16BE(2**power*16,start+6);
    output.writeUInt16BE(power,start+8);output.writeUInt16BE(n*16-2**power*16,start+10);
    face.tables.forEach((table,index)=>{const record=start+12+index*16;output.write(table.tag,record);output.writeUInt32BE(checksum(table.bytes),record+4);output.writeUInt32BE(table.offset,record+8);output.writeUInt32BE(table.bytes.length,record+12);});
  }
  for(const table of all)table.bytes.copy(output,table.offset);
  if(!collection)output.writeUInt32BE((0xb1b0afba-checksum(output))>>>0,all.find(table=>table.tag==='head').offset+8);
  return output;
}

/** Test derivative: new family/PS identity and deliberately different advances.
 * Copyright, license, glyphs, character mapping and other name records survive.
 */
export function metricsVariant(font,id,{delta=64,expand=true}={}) {
  const tables=fontTables(font),name=tables.get('name'),count=name.readUInt16BE(2),strings=name.readUInt16BE(4);
  assert.equal(name.readUInt16BE(0),0,'Bundled fixtures use name format 0');
  const header=Buffer.from(name.subarray(0,6+count*12)),payload=[],family=`OPF Metrics Fixture ${id}`,psName=`OPFMetricsFixture${id}`;
  header.writeUInt16BE(header.length,4);let offset=0;
  for(let index=0;index<count;index++){
    const record=6+index*12,platform=name.readUInt16BE(record),nameId=name.readUInt16BE(record+6);
    let bytes=Buffer.from(name.subarray(strings+name.readUInt16BE(record+10),strings+name.readUInt16BE(record+10)+name.readUInt16BE(record+8)));
    if([1,3,4,6,16,21].includes(nameId)){
      const text=nameId===6?psName:family;
      bytes=platform===0||platform===3?Buffer.from(text,'utf16le').swap16():Buffer.from(text,'ascii');
    }
    header.writeUInt16BE(bytes.length,record+8);header.writeUInt16BE(offset,record+10);payload.push(bytes);offset+=bytes.length;
  }
  tables.set('name',Buffer.concat([header,...payload]));
  const n=tables.get('maxp').readUInt16BE(4),m=tables.get('hhea').readUInt16BE(34),nextM=expand?n:m,old=tables.get('hmtx');
  const metrics=Buffer.alloc(nextM*4+(n-nextM)*2);let maximum=0;
  for(let i=0;i<n;i++){
    const advance=old.readUInt16BE(Math.min(i,m-1)*4)+delta,left=old.readInt16BE(i<m?i*4+2:m*4+(i-m)*2);
    if(i<nextM){metrics.writeUInt16BE(advance,i*4);metrics.writeInt16BE(left,i*4+2);}
    else metrics.writeInt16BE(left,nextM*4+(i-nextM)*2);
    maximum=Math.max(maximum,advance);
  }
  tables.set('hmtx',metrics);tables.get('hhea').writeUInt16BE(nextM,34);tables.get('hhea').writeUInt16BE(maximum,10);
  tables.get('hhea').writeInt16BE(tables.get('hhea').readInt16BE(14)+delta,14);
  // Reuse the original directory for the independently rewritten table set.
  let length=12+tables.size*16;for(const bytes of tables.values())length+=align(bytes.length);
  const temporary=Buffer.alloc(length);temporary.writeUInt32BE(font.readUInt32BE(0));temporary.writeUInt16BE(tables.size,4);
  let start=12+tables.size*16,index=0;for(const [tag,bytes]of tables){const record=12+index++*16;temporary.write(tag,record);temporary.writeUInt32BE(start,record+8);temporary.writeUInt32BE(bytes.length,record+12);bytes.copy(temporary,start);start+=align(bytes.length);}
  return {data:makeSfntCollection([temporary],false),postscriptName:psName};
}

/** Read WOFF2 table bytes/collection indices without invoking the product codec. */
export function readWoff2(data) {
  let offset=48;
  const byte=()=>data[offset++];
  const length=()=>{let n=0,b;do{b=byte();n=n*128+(b&127);}while(b&128);return n;};
  const short=()=>{const code=byte();return code<253?code:code===253?byte()*256+byte():code===254?506+byte():253+byte();};
  const entries=[];
  for(let index=0;index<data.readUInt16BE(12);index++){
    const flags=byte(),tagIndex=flags&63,tag=tagIndex===63?data.toString('ascii',offset,(offset+=4)):tags[tagIndex],version=flags>>6;
    const originalLength=length(),transformed=(tag==='glyf'||tag==='loca')?version===0:version!==0;
    entries.push({tag,version,originalLength,length:transformed?length():originalLength});
  }
  const faces=[];let collectionVersion;
  if(data.toString('ascii',4,8)==='ttcf'){
    collectionVersion=data.readUInt32BE(offset);offset+=4;const count=short();
    for(let index=0;index<count;index++){const n=short(),flavor=data.readUInt32BE(offset);offset+=4;faces.push({flavor,indices:Array.from({length:n},short)});}
  }else faces.push({flavor:data.readUInt32BE(4),indices:entries.map((_,index)=>index)});
  const decoded=brotliDecompressSync(data.subarray(offset,offset+data.readUInt32BE(20)));offset=0;
  for(const entry of entries){entry.bytes=Buffer.from(decoded.subarray(offset,offset+entry.length));offset+=entry.length;}
  assert.equal(offset,decoded.length);
  return {header:Buffer.from(data.subarray(0,48)),entries,faces,collectionVersion};
}

export function writeWoff2(container) {
  const records=[];
  for(const {tag,version,originalLength,bytes}of container.entries){
    const index=tags.indexOf(tag),transformed=(tag==='glyf'||tag==='loca')?version===0:version!==0;
    records.push(Buffer.from([(version<<6)|(index<0?63:index)]),...(index<0?[Buffer.from(tag)]:[]),base128(originalLength),...(transformed?[base128(bytes.length)]:[]));
  }
  if(container.collectionVersion)records.push(u32(container.collectionVersion),ushort(container.faces.length),...container.faces.flatMap(face=>[ushort(face.indices.length),u32(face.flavor),...face.indices.map(ushort)]));
  const directory=Buffer.concat(records),compressed=brotliCompressSync(Buffer.concat(container.entries.map(entry=>entry.bytes)),{params:{[constants.BROTLI_PARAM_QUALITY]:4}});
  const output=Buffer.alloc(align(48+directory.length+compressed.length));container.header.copy(output);
  output.writeUInt32BE(output.length,8);output.writeUInt16BE(container.entries.length,12);output.writeUInt32BE(compressed.length,20);output.fill(0,28,48);
  directory.copy(output,48);compressed.copy(output,48+directory.length);return output;
}

/** One shared glyph pair may also use the null transform. */
export function literalGlyphs(container,font) {
  const tables=fontTables(font);
  for(const tag of ['glyf','loca']){
    const entries=container.entries.filter(entry=>entry.tag===tag);assert.equal(entries.length,1);
    Object.assign(entries[0],{version:3,bytes:tables.get(tag),originalLength:tables.get(tag).length});
  }
  for(const entry of container.entries.filter(entry=>entry.tag==='head'))entry.bytes=tables.get('head');
}

/** Start with a Google-accepted collection; change only its hmtx transforms. */
export async function collectionFixture(fonts) {
  const source=makeSfntCollection(fonts,true),baseline=Buffer.from(await wawoff2.compress(source));
  const googleReference=Buffer.from(await wawoff2.decompress(baseline));
  const container=readWoff2(baseline),glyphIndices=container.faces.map(face=>face.indices.find(index=>container.entries[index].tag==='glyf'));
  assert.ok(new Set(glyphIndices).size<fonts.length,'Fixture must contain actual shared glyph table indices');
  return {source,baseline,googleReference,transform(flags,{firstRaw=false,edit}={}){
    const prepared=readWoff2(baseline);
    prepared.faces.forEach((face,index)=>{
      if(firstRaw&&index===0)return;
      const entry=prepared.entries[face.indices.find(index=>prepared.entries[index].tag==='hmtx')];
      entry.version=1;entry.bytes=transformHmtx(fontTables(fonts[index]),flags);
    });
    edit?.(prepared);
    return writeWoff2(prepared);
  }};
}
