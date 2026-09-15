/** Diagnostic cross-platform measurements. This is not an acceptance gate. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {create} from 'fontkit';
import * as hb from 'harfbuzzjs';
import {chromium} from 'playwright';
import {fontFixtures,instanceCases} from './font-variations-fixtures.mjs';
import {selectFontVariations} from '../dist/font-variations.js';
const records=(await fontFixtures()).filter(record=>Object.keys(record.axes).length);
const out={node:process.version,platform:process.platform,harfbuzz:hb.versionString(),kind:'diagnostic-not-acceptance',cases:[]};
const channel=process.env.OPF_FONT_PROBE_BROWSER_CHANNEL;
const browser=await chromium.launch({...(channel?{channel}:{})});out.channel=channel??'pinned-chromium';
try{
 out.browser=browser.version();const page=await browser.newPage();
 await page.route('**/*',route=>route.abort());
 for(const record of records){
  const raw=create(record.data),blob=new hb.Blob(record.data.buffer.slice(record.data.byteOffset,record.data.byteOffset+record.data.byteLength)),face=new hb.Face(blob),font=new hb.Font(face);
  const inputs=[];
  for(const item of instanceCases(record)){
   const fk=raw.getVariation(item.coordinates),glyph=fk.glyphForCodePoint(72),glyphId=glyph.id;
   const registryAdvance=selectFontVariations(raw,record.data,{variations:item.coordinates}).font.getGlyph(glyphId).advanceWidth;
   font.setVariations(Object.entries(item.coordinates).map(([tag,value])=>new hb.Variation(tag,value)));
   font.setScale(face.upem,face.upem);const integerAdvance=font.glyphHAdvance(glyphId);
   font.setScale(face.upem*1024,face.upem*1024);const preciseAdvance=font.glyphHAdvance(glyphId)/1024;
   inputs.push({id:item.id,coordinates:item.coordinates,glyphId,unitsPerEm:face.upem,fontkitAdvance:glyph.advanceWidth,registryAdvance,harfbuzzAdvance:integerAdvance,harfbuzzPreciseAdvance:preciseAdvance});
  }
  const observations=await page.evaluate(async({data,italic,inputs})=>{
   const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),observations=[],baseline=document.fonts.size;
   for(const item of inputs){
    const settings=Object.entries(item.coordinates).map(([tag,value])=>`"${tag}" ${value}`).join(', ');
    const face=new FontFace('MetricsProbe',bytes,{weight:'400',style:italic?'italic':'normal',variationSettings:settings});await face.load();document.fonts.add(face);
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.textRendering='geometricPrecision';
    const measured=[];
    for(const kerning of ['none','normal'])for(const size of [12,32,72])for(const count of [1,128]){
     ctx.fontKerning=kerning;ctx.font=`${italic?'italic':'normal'} 400 ${size}px MetricsProbe`;
     measured.push({kerning,size,count,width:ctx.measureText('H'.repeat(count)).width});
    }
    observations.push({...item,measurements:measured});document.fonts.delete(face);
   }
   if(document.fonts.size!==baseline)throw new Error('Probe face cleanup failed');
   return observations;
  },{data:record.data.toString('base64'),italic:record.italic,inputs});
  out.cases.push(...observations.map(item=>({file:record.file,outline:record.outline,...item})));
 }
}finally{await browser.close();}
for(const row of out.cases)for(const m of row.measurements)assert.ok(Number.isFinite(m.width)&&m.width>0,'Require measured glyphs');
out.summary={};
for(const outline of ['CFF2','glyf']){
 const rows=out.cases.filter(row=>row.outline===outline),samples=rows.flatMap(row=>row.measurements.map(m=>({row,m})));
 out.summary[outline]={cases:rows.length,samples:samples.length,maxAbsoluteDriftPx:Object.fromEntries(['fontkitAdvance','registryAdvance','harfbuzzAdvance','harfbuzzPreciseAdvance'].map(key=>[key,Math.max(...samples.map(({row,m})=>Math.abs(row[key]/row.unitsPerEm*m.size*m.count-m.width)))]))};
 out.summary[outline].byKerning=Object.fromEntries(['none','normal'].map(kerning=>[kerning,Object.fromEntries(['fontkitAdvance','registryAdvance','harfbuzzAdvance','harfbuzzPreciseAdvance'].map(key=>[key,Math.max(...samples.filter(({m})=>m.kerning===kerning).map(({row,m})=>Math.abs(row[key]/row.unitsPerEm*m.size*m.count-m.width)))]))]));
}
const destination=process.argv[2]??'artifacts/font-shaping/variation-metrics/native-probe.json';
await mkdir(path.dirname(path.resolve(destination)),{recursive:true});
await writeFile(destination,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({platform:out.platform,browser:out.browser,kind:out.kind,summary:out.summary}));
