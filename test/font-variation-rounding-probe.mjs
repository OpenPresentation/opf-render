// Rejected-candidate diagnostic only: this does not modify product code.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {create} from 'fontkit';
import {chromium} from 'playwright';
import {selectFontVariations} from '../dist/font-variations.js';
import {fontFixtures,sha256} from './font-variations-fixtures.mjs';
const sources=[];
const report=async file=>{
 const compressed=await readFile(new URL('../'+file,import.meta.url)),decoded=gunzipSync(compressed);
 sources.push({file,compressedSha256:sha256(compressed),decodedSha256:sha256(decoded)});
 return JSON.parse(decoded);
};
const [linux,mac,linuxMetrics,macMetrics,records]=await Promise.all([
 report('docs/evidence/native-metric-portability-20260915/linux-browser.json.gz'),
 report('docs/evidence/cff2-advances-paint-20260914/browser.json.gz'),
 report('docs/evidence/native-metric-portability-20260915/linux-metrics.json.gz'),
 report('docs/evidence/native-metric-portability-20260915/macos-metrics.json.gz'),fontFixtures()]);
assert.equal(linux.browser,mac.browser);
const text='  office affine AVATAR  ',out={status:'diagnostic-not-acceptance',node:process.version,platform:process.platform,retainedBrowser:linux.browser,sourceReports:sources.sort((a,b)=>a.file.localeCompare(b.file)),candidate:'Round only TrueType HVAR glyph advances before the unchanged Fontkit GPOS phase, using the existing CFF2 metric policy.',rows:[],live:[],stress:[]};
const measured=new Map();
function candidate(record,coordinates,round){
 const selected=selectFontVariations(create(record.data),record.data,{variations:coordinates}).font;
 if(round&&selected.directory.tables.glyf&&selected.HVAR){
  const processor=selected._variationProcessor,horizontal=selected.HVAR,get=processor.getAdvanceAdjustment.bind(processor);
  processor.getAdvanceAdjustment=(gid,table)=>{
   const delta=get(gid,table);if(table!==horizontal)return delta;
   const metrics=selected.hmtx.metrics,base=metrics.get(Math.min(gid,metrics.length-1)).advance;
   return Math.max(0,base+Math.sign(delta)*Math.round(Math.abs(delta)))-base;
  };
 }
 return selected;
}
for(const row of linux.observations.filter(r=>r.backend==='fontkit')){
 const key=JSON.stringify([row.file,row.id]),record=records.find(r=>r.file===row.file);
 const other=mac.observations.find(r=>r.backend===row.backend&&r.file===row.file&&r.format===row.format&&r.id===row.id);assert.ok(other);
 assert.deepEqual(other.coordinates,row.coordinates);
 assert.equal(other.measured,row.measured,'Require the same existing metrics in both retained browser reports');
 let item=measured.get(key);
 if(!item){
  const before=candidate(record,row.coordinates,false),after=candidate(record,row.coordinates,true);
  const a=before.layout(text),b=after.layout(text);
  assert.deepEqual(a.glyphs.map(g=>g.id),b.glyphs.map(g=>g.id));
  const width=run=>run.advanceWidth*32/before.unitsPerEm;
  item={file:row.file,id:row.id,coordinates:row.coordinates,sourceSha256:sha256(record.data),current:width(a),candidate:width(b),glyphs:a.glyphs.map((g,i)=>({id:g.id,currentAdvance:g.advanceWidth,candidateAdvance:b.glyphs[i].advanceWidth,currentPosition:a.positions[i],candidatePosition:b.positions[i]}))};
  measured.set(key,item);
 }
 assert.equal(item.current,row.measured);
 out.rows.push({...item,format:row.format,linux:row.snapshots[0].advance,mac:other.snapshots[0].advance});
}
for(const row of linuxMetrics.cases.filter(r=>r.outline==='glyf')){
 const other=macMetrics.cases.find(r=>r.file===row.file&&r.id===row.id);assert.ok(other);
 const record=records.find(r=>r.file===row.file),before=candidate(record,row.coordinates,false),after=candidate(record,row.coordinates,true);
 for(const m of row.measurements){
  const n=other.measurements.find(n=>n.kerning===m.kerning&&n.size===m.size&&n.count===m.count);
  const unit=m.size*m.count/before.unitsPerEm;
  out.stress.push({file:row.file,id:row.id,coordinates:row.coordinates,...m,linux:m.width,mac:n.width,current:before.getGlyph(row.glyphId).advanceWidth*unit,candidate:after.getGlyph(row.glyphId).advanceWidth*unit});
 }
}
const browser=await chromium.launch();out.liveBrowser=browser.version();
try{
 const page=await browser.newPage();await page.route('**/*',route=>route.abort());
 for(const item of [...measured.values()].filter(r=>out.rows.some(row=>row.file===r.file&&row.id===r.id&&Math.abs(row.current-row.linux)>=.1))){
  const record=records.find(r=>r.file===item.file);
  const native=await page.evaluate(async({bytes,coordinates,italic,text})=>{
   const data=Uint8Array.from(atob(bytes),c=>c.charCodeAt(0)),settings=Object.entries(coordinates).map(([tag,value])=>`"${tag}" ${value}`).join(', ');
   const face=new FontFace('Probe',data,{weight:'400',style:italic?'italic':'normal',variationSettings:settings});await face.load();document.fonts.add(face);
   const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=100;const ctx=canvas.getContext('2d');ctx.textRendering='geometricPrecision';ctx.fontKerning='normal';ctx.font=`${italic?'italic':'normal'} 400 32px Probe`;ctx.fillText(text,10,80);
   const width=ctx.measureText(text).width,ink=ctx.getImageData(0,0,1000,100).data.some((n,i)=>i%4===3&&n!==0);
   document.fonts.delete(face);return {width,ink};
  },{bytes:record.data.toString('base64'),coordinates:item.coordinates,italic:record.italic,text});
  assert.ok(native.ink);out.live.push({...item,native});
 }
}finally{await browser.close();}
out.summary={matrixRows:out.rows.length,failures:Object.fromEntries(['current','candidate'].map(key=>[key,Object.fromEntries(['linux','mac'].map(platform=>[platform,out.rows.filter(r=>Math.abs(r[key]-r[platform])>=.1).length]))])),stressRows:out.stress.length,stressIncompatibleWithOnePrediction:out.stress.filter(r=>Math.abs(r.linux-r.mac)>=.2).length,maxStressPlatformGap:Math.max(...out.stress.map(r=>Math.abs(r.linux-r.mac))),live:out.live.map(r=>({file:r.file,id:r.id,currentError:r.current-r.native.width,candidateError:r.candidate-r.native.width}))};
const destination=path.resolve(process.argv[2]??'artifacts/font-shaping/variation-rounding-probe.json');
await mkdir(path.dirname(destination),{recursive:true});
await writeFile(destination,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out.summary,null,2));
