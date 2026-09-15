import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {create} from 'fontkit';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {createFontRegistry} from '../dist/fonts.js';
import {loadBundledFontRegistry} from '../dist/fonts-node.js';

const bundled=await loadBundledFontRegistry();
const records=bundled.embeddedFonts.filter(face=>face.family==='Roboto'&&!face.italic&&[400,700].includes(face.weight));
assert.equal(records.length,2);
const fonts=records.map(face=>Buffer.from(face.dataUrl.split(',')[1],'base64'));
const align=value=>(value+3)&~3;
// A real two-face TTC: table offsets are relative to the collection, and
// checkSumAdjustment is zero for each contained font per the collection format.
let offset=align(12+fonts.length*4);
const offsets=fonts.map(font=>{const start=offset;offset+=align(font.length);return start;});
const collection=Buffer.alloc(offset);
collection.write('ttcf');collection.writeUInt32BE(0x10000,4);collection.writeUInt32BE(fonts.length,8);
for(const [index,font]of fonts.entries()){
  const start=offsets[index];collection.writeUInt32BE(start,12+index*4);font.copy(collection,start);
  const tables=font.readUInt16BE(4);
  for(let i=0;i<tables;i++){
    const record=12+i*16,position=font.readUInt32BE(record+8);
    collection.writeUInt32BE(position+start,start+record+8);
    if(font.toString('ascii',record,record+4)==='head')collection.writeUInt32BE(0,start+position+8);
  }
}
const service=await loadHarfBuzzShaper();
assert.throws(()=>createFontRegistry([{data:collection}],{fontShaper:service}),{code:'font-collection'});
const widths=[];
for(const [index,font] of fonts.entries()){
  const postscriptName=create(font).postscriptName;
  const single=createFontRegistry([{data:font,family:'Fixture'}],{fontShaper:service});
  const selected=createFontRegistry([{data:collection,family:'Fixture',postscriptName}],{fontShaper:service});
  const text='office AVATAR accent',style={fontFamily:'Fixture'};
  assert.deepEqual(selected.shapeText(text,style),single.shapeText(text,style));
  widths.push(selected.textMeasurement.measure(text,32,style));
  selected.dispose();single.dispose();
}
assert.notEqual(widths[0],widths[1],'Selecting a second physical face must affect actual shaping');

// Keep existing compressed-font support explicit: a valid compressed WOFF
// works with the default backend and rejects this still-incomplete opt-in one.
const font=fonts[0],count=font.readUInt16BE(4),tables=[];
offset=44+count*20;
for(let i=0;i<count;i++){
  const record=12+i*16,start=font.readUInt32BE(record+8),length=font.readUInt32BE(record+12);
  const source=font.subarray(start,start+length),compressed=deflateSync(source);
  const bytes=compressed.length<source.length?compressed:source;
  tables.push({tag:font.subarray(record,record+4),checksum:font.readUInt32BE(record+4),length,bytes,offset});
  offset+=align(bytes.length);
}
const woff=Buffer.alloc(offset);woff.write('wOFF');font.copy(woff,4,0,4);woff.writeUInt32BE(offset,8);woff.writeUInt16BE(count,12);woff.writeUInt32BE(font.length,16);
for(const [index,table]of tables.entries()){
  const record=44+index*20;table.tag.copy(woff,record);woff.writeUInt32BE(table.offset,record+4);
  woff.writeUInt32BE(table.bytes.length,record+8);woff.writeUInt32BE(table.length,record+12);woff.writeUInt32BE(table.checksum,record+16);table.bytes.copy(woff,table.offset);
}
const compressed=createFontRegistry([{data:woff,family:'Fixture'}]);
const uncompressed=createFontRegistry([{data:font,family:'Fixture'}]);
assert.equal(compressed.textMeasurement.measure('office',32,{fontFamily:'Fixture'}),uncompressed.textMeasurement.measure('office',32,{fontFamily:'Fixture'}));
assert.throws(()=>createFontRegistry([{data:woff,family:'Fixture'}],{fontShaper:service}),{code:'shaping-font-format'});
for(const registry of [bundled,compressed,uncompressed])registry.dispose();
console.log('Shaping format boundary: two real collection faces select exactly; existing WOFF behavior preserved and unsupported opt-in WOFF rejects explicitly. No browser collection or WOFF2 acceptance claimed.');
