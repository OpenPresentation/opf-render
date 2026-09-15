import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {create} from 'fontkit';
import * as hb from 'harfbuzzjs';
import {createFontRegistry} from '../dist/fonts.js';
import {selectFontVariations} from '../dist/font-variations.js';
import {normalizeVariationCoordinates,readVariationMaps} from '../dist/font-normalization.js';
import {buildSfnt} from '../dist/font-sfnt.js';
import {fontTables} from './font-container-fixtures.mjs';
import {fontFixtures,instanceCases} from './font-variations-fixtures.mjs';
const records=(await fontFixtures()).filter(r=>Object.keys(r.axes).length),reference=JSON.parse(await readFile(new URL('./fixtures/font-formats/normalization-reference.json',import.meta.url)));
const report={node:process.version,fontTools:reference.fontTools,freeType:reference.freeType,instances:0,glyphInstances:0,positionRuns:0,fractionalPositionRuns:0,endpointControls:0,mappingControls:0,axisTagControls:0};
const axis=(min,def,max)=>({axisTag:'wght',minValue:min,defaultValue:def,maxValue:max});
// Normative 16.16 input rounding followed by (fixed + 2) >> 2: converting
// directly from floating point to 2.14 gives the wrong result at these ties.
for(const [value,expected]of [[1.5/65536,1/16384],[1.499/65536,0],[-2.5/65536,0],[-2.501/65536,-1/16384]])assert.deepEqual(normalizeVariationCoordinates([axis(-1,0,1)],{wght:value}),[expected]);
for(const a of [axis(0,0,1),axis(0,1,1),axis(1,1,1)])assert.deepEqual(normalizeVariationCoordinates([a],{wght:a.defaultValue}),[0]);
function avar(pairs,{major=1,axes=1,reserved=0}={}){
 const bytes=Buffer.alloc(10+pairs.length*4);bytes.writeUInt16BE(major,0);bytes.writeUInt16BE(reserved,4);bytes.writeUInt16BE(axes,6);bytes.writeUInt16BE(pairs.length,8);
 for(const [i,p]of pairs.entries()){bytes.writeInt16BE(p[0]*16384,10+i*4);bytes.writeInt16BE(p[1]*16384,12+i*4);}return bytes;
}
const read=bytes=>readVariationMaps(bytes,{offset:0,length:bytes.length},1);
const maps=read(avar([[-1,-1],[-.75,-.5],[0,0],[1,1]]));
// The OpenType overview's 250 on a 100/400/900 axis maps to -1/3.
assert.deepEqual(normalizeVariationCoordinates([axis(100,400,900)],{wght:250},maps),[-5461/16384]);
for(const pairs of [[],[[-1,-1],[1,1]],[[-1,-1],[0,.25],[1,1]]]){
 assert.deepEqual(read(avar(pairs)).segment[0].correspondence,[]);report.mappingControls++;
}
for(const bytes of [avar([[-1,-1],[0,0],[0,0],[1,1]]),avar([[-1,-1],[0,0],[.5,-.5],[1,1]]),avar([[-1.5,-1],[0,0],[1,1]]),avar([],{major:2}),avar([],{axes:2}),avar([],{reserved:1}),avar([]).subarray(0,9)]){
 assert.throws(()=>read(bytes),{code:'invalid-font-variations'});report.mappingControls++;
}
for(const record of records){
 const raw=create(record.data),blob=new hb.Blob(record.data.buffer.slice(record.data.byteOffset,record.data.byteOffset+record.data.byteLength)),face=new hb.Face(blob),font=new hb.Font(face);font.setScale(face.upem,face.upem);
 for(const item of instanceCases(record)){
  const selected=selectFontVariations(raw,record.data,{variations:item.coordinates}).font;
  const expected=reference.cases.find(row=>row.file===record.file&&row.id===item.id);
  assert.deepEqual(selected._variationProcessor.normalizedCoords,expected.normalized,`${record.file}/${item.id}`);report.instances++;
  if(record.outline==='CFF2'){
   font.setVariations(Object.entries(item.coordinates).map(([tag,value])=>new hb.Variation(tag,value)));
   for(let gid=0;gid<raw.numGlyphs;gid++){
    const base=raw.hmtx.metrics.get(Math.min(gid,raw.hmtx.metrics.length-1)).advance;
    const delta=selected._variationProcessor.getAdvanceAdjustment(gid,raw.HVAR),rounded=Math.sign(delta)*Math.round(Math.abs(delta));
    assert.equal(Math.max(0,base+rounded),font.glyphHAdvance(gid),`${record.file}/${item.id}/${gid}`);report.glyphInstances++;
    assert.equal(selected.getGlyph(gid).advanceWidth,font.glyphHAdvance(gid),'Selected CFF2 glyph metrics must use the canonical advance before shaping');
   }
   const positionedReference=raw.getVariation(item.coordinates);
   positionedReference._variationProcessor.normalizedCoords=expected.normalized;
   positionedReference._variationProcessor.getAdvanceAdjustment=gid=>font.glyphHAdvance(gid)-raw.hmtx.metrics.get(Math.min(gid,raw.hmtx.metrics.length-1)).advance;
   for(const text of ['  AVATAR office  ','o\u0302\u0301']){
    const actual=selected.layout(text),independent=positionedReference.layout(text);
    assert.deepEqual(actual.glyphs.map(g=>g.id),independent.glyphs.map(g=>g.id));
    assert.deepEqual(actual.positions,independent.positions,'Preserve kerning and mark positions after installing canonical glyph advances');report.positionRuns++;
    if(actual.positions.some(p=>Object.values(p).some(v=>typeof v==='number'&&!Number.isInteger(v))))report.fractionalPositionRuns++;
   }
  }
 }
 for(const endpoint of ['minimum','maximum','collapsed']){
  const tables=fontTables(record.data),fvar=Buffer.from(tables.get('fvar')),offset=fvar.readUInt16BE(4),size=fvar.readUInt16BE(10),count=fvar.readUInt16BE(8),defaults={};
  fvar.writeUInt16BE(0,12); // In-memory controls do not keep now-invalid named coordinates.
  for(let i=0;i<count;i++){
   const o=offset+i*size,tag=fvar.toString('ascii',o,o+4),value=fvar.readInt32BE(o+(endpoint==='minimum'?4:12));
   fvar.writeInt32BE(value,o+8);if(endpoint==='collapsed')fvar.writeInt32BE(value,o+4);defaults[tag]=value/65536;
  }
  tables.set('fvar',fvar);
  const data=Buffer.from(buildSfnt([...tables].map(([tag,data])=>({tag:Buffer.from(tag).readUInt32BE(),data})),record.data.readUInt32BE()).data);
  const selected=selectFontVariations(create(data),data).font;
  assert.deepEqual(selected._variationProcessor.normalizedCoords,Array(count).fill(0));
  const expected=raw.getVariation(Object.fromEntries(Object.entries(record.axes).map(([tag,a])=>[tag,a.default])));expected._variationProcessor.normalizedCoords=Array(count).fill(0);
  const registry=createFontRegistry([{data,family:'Endpoint',italic:record.italic}]);
  assert.equal(registry.textMeasurement.measure('AVATAR office',32,{fontFamily:'Endpoint',italic:record.italic}),expected.layout('AVATAR office').advanceWidth*32/raw.unitsPerEm);
  assert.deepEqual(Buffer.from(registry.embeddedFonts[0].dataUrl.split(',')[1],'base64'),data);registry.dispose();report.endpointControls++;
 }
 const tables=fontTables(record.data),fvar=Buffer.from(tables.get('fvar')),offset=fvar.readUInt16BE(4),tag=fvar.toString('ascii',offset,offset+4),renamed='ax  ';
 fvar.write(renamed,offset,'ascii');tables.set('fvar',fvar);
 const data=Buffer.from(buildSfnt([...tables].map(([tag,data])=>({tag:Buffer.from(tag).readUInt32BE(),data})),record.data.readUInt32BE()).data);
 const original=reference.cases.find(row=>row.file===record.file&&row.id==='maximum'),values={...original.coordinates,[renamed]:original.coordinates[tag]};delete values[tag];
 const selected=selectFontVariations(create(data),data,{variations:values}).font;
 assert.deepEqual(selected.variationCoords,Object.values(original.coordinates));assert.deepEqual(selected._variationProcessor.normalizedCoords,original.normalized);report.axisTagControls++;
}
assert.ok(report.fractionalPositionRuns>0,'Require real fractional positioning coverage, not only integral default instances');
await mkdir('artifacts/font-shaping',{recursive:true});await writeFile('artifacts/font-shaping/normalization.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
