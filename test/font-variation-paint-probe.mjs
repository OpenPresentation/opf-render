/** Compare browser instance painting to independent selected glyph outlines. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import * as hb from 'harfbuzzjs';
import {chromium} from 'playwright';
import {fontFixtures,instanceCases,sha256} from './font-variations-fixtures.mjs';
const destination=path.resolve(process.argv[2]??'artifacts/font-shaping/variation-paint');await mkdir(destination,{recursive:true});
const channel=process.env.OPF_FONT_PROBE_BROWSER_CHANNEL;
const browser=await chromium.launch({...(channel?{channel}:{})});
const report={node:process.version,platform:process.platform,browser:browser.version(),channel:channel??'pinned-chromium',harfbuzz:hb.versionString(),kind:'diagnostic-not-acceptance',cases:[],errors:[],requests:[]};
try{
 const page=await browser.newPage();page.on('pageerror',error=>report.errors.push(error.message));await page.route('**/*',route=>{report.requests.push(route.request().url());return route.abort();});
 for(const record of (await fontFixtures()).filter(r=>Object.keys(r.axes).length)){
  const blob=new hb.Blob(record.data.buffer.slice(record.data.byteOffset,record.data.byteOffset+record.data.byteLength)),face=new hb.Face(blob),font=new hb.Font(face);font.setScale(face.upem,face.upem);
  const instances=instanceCases(record),paths=[];
  for(const instance of instances){
   font.setVariations(Object.entries(instance.coordinates).map(([tag,value])=>new hb.Variation(tag,value)));
   paths.push({...instance,glyphs:[...'HgW'].map(text=>{const glyphId=font.nominalGlyph(text.codePointAt(0));assert.ok(glyphId);return {text,glyphId,path:font.glyphToPath(glyphId),advance:font.glyphHAdvance(glyphId),bounds:font.glyphExtents(glyphId)};})});
  }
  const result=await page.evaluate(async({bytes,italic,instances,upem})=>{
   const raw=Uint8Array.from(atob(bytes),c=>c.charCodeAt(0)),baseline=document.fonts.size,rows=[],images=[];
   const make=()=>{const canvas=document.createElement('canvas');canvas.width=440;canvas.height=440;return canvas;};
   const mask=canvas=>{const rgba=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;return Uint8Array.from({length:rgba.length/4},(_,i)=>rgba[i*4+3]);};
   const difference=(a,b)=>{let error=0,ink=0;for(let i=0;i<a.length;i++){error+=Math.abs(a[i]-b[i]);ink+=Math.max(a[i],b[i]);}return ink?error/ink:null;};
   const bounds=a=>{let x0=440,y0=440,x1=-1,y1=-1;for(let i=0;i<a.length;i++)if(a[i]>0){const x=i%440,y=Math.floor(i/440);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return x1<0?null:{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1};};
   const outline=glyph=>{const canvas=make(),ctx=canvas.getContext('2d');ctx.translate(60,320);ctx.scale(256/upem,-256/upem);ctx.fill(new Path2D(glyph.path));return canvas;};
   const controls=instances.filter(i=>['default','minimum','maximum'].includes(i.id)).map(instance=>({...instance,masks:instance.glyphs.map(g=>mask(outline(g)))}));
   for(const instance of instances){
    const settings=Object.entries(instance.coordinates).map(([tag,value])=>`"${tag}" ${value}`).join(', ');
    const face=new FontFace('PaintProbe',raw,{weight:'400',style:italic?'italic':'normal',variationSettings:settings});await face.load();document.fonts.add(face);
    for(const [index,glyph]of instance.glyphs.entries()){
     const canvas=make(),ctx=canvas.getContext('2d');ctx.fontKerning='normal';ctx.textRendering='geometricPrecision';ctx.font=`${italic?'italic':'normal'} 400 256px PaintProbe`;
     const advance=ctx.measureText(glyph.text).width;ctx.fillText(glyph.text,60,320);
     const nativeMask=mask(canvas),selected=outline(glyph),selectedMask=mask(selected);
     const row={id:instance.id,coordinates:instance.coordinates,text:glyph.text,glyphId:glyph.glyphId,nativeAdvance:advance,harfbuzzAdvance:glyph.advance/upem*256,nativeBounds:bounds(nativeMask),outlineBounds:bounds(selectedMask),selectedDifference:difference(nativeMask,selectedMask),controls:controls.map(c=>({id:c.id,difference:difference(nativeMask,c.masks[index])}))};rows.push(row);
     if(glyph.text==='g'&&(['default','minimum','maximum','interior'].includes(instance.id)||instance.id.includes('Display ExtraLight'))){
      const sheet=document.createElement('canvas');sheet.width=880;sheet.height=470;const s=sheet.getContext('2d');s.fillStyle='white';s.fillRect(0,0,880,470);s.fillStyle='black';s.font='16px sans-serif';s.fillText(`${instance.id}: browser`,20,22);s.fillText('Selected HarfBuzz outline',460,22);s.drawImage(canvas,0,30);s.drawImage(selected,440,30);images.push({id:instance.id,data:sheet.toDataURL('image/png').split(',')[1]});
     }
    }
    document.fonts.delete(face);
   }
   if(document.fonts.size!==baseline)throw new Error('Paint probe leaked font faces');return {rows,images};
  },{bytes:record.data.toString('base64'),italic:record.italic,instances:paths,upem:face.upem});
  const prefix=record.file.replaceAll('/','-');
  for(const img of result.images)await writeFile(path.join(destination,`${prefix}-${img.id.replace(/[^A-Za-z0-9._-]/g,'_')}.png`),Buffer.from(img.data,'base64'));
  report.cases.push(...result.rows.map(row=>({file:record.file,sourceSha256:sha256(record.data),outline:record.outline,...row})));
 }
}finally{await browser.close();}
report.summary=Object.fromEntries(['CFF2','glyf'].map(outline=>{
 const rows=report.cases.filter(row=>row.outline===outline),worst=[...rows].sort((a,b)=>b.selectedDifference-a.selectedDifference).slice(0,10);
 return [outline,{cases:rows.length,maxSelectedDifference:Math.max(...rows.map(r=>r.selectedDifference)),maxAdvanceDrift:Math.max(...rows.map(r=>Math.abs(r.nativeAdvance-r.harfbuzzAdvance))),wrongControlCloser:rows.filter(row=>row.controls.some(c=>c.difference+0.01<row.selectedDifference)).length,worst}];
}));
await writeFile(path.join(destination,'report.json'),JSON.stringify(report,null,2)+'\n');
assert.equal(report.errors.length,0);assert.equal(report.requests.length,0);assert.ok(report.cases.every(row=>[row.nativeBounds,row.outlineBounds].every(b=>b&&b.x>0&&b.y>0&&b.x+b.width<440&&b.y+b.height<440)&&Number.isFinite(row.selectedDifference)));
console.log(JSON.stringify({platform:report.platform,browser:report.browser,cases:report.cases.length,summary:Object.fromEntries(Object.entries(report.summary).map(([k,{worst,...v}])=>[k,v]))}));
