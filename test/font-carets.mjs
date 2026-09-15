import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import * as hb from 'harfbuzzjs';
import {prepareNodeFonts} from '../dist/fonts-node.js';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {shapingDirection} from '../dist/font-direction.js';
import {scriptDirectionRanges,rtlScriptTags} from '../dist/font-direction-data.js';

const output=new URL('../artifacts/font-shaping/carets/',import.meta.url);
await mkdir(output,{recursive:true});
const prepared=await prepareNodeFonts({pack:'office',fontShaper:await loadHarfBuzzShaper()});
const records=[];let fontCarets=0,interpolated=0;
try{
 for(const entry of prepared.registry.embeddedFonts){
  const bytes=Buffer.from(entry.dataUrl.split(',')[1],'base64');
  const font=new hb.Font(new hb.Face(new hb.Blob(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))));
  const style={fontFamily:entry.family,fontWeight:entry.weight,italic:entry.italic};
  for(const text of ['office affine','  AVA  ','o\u0302\u0301']){
   let run;try{run=prepared.registry.textPainting.shape(text,style);}catch(error){assert.equal(error.code,'missing-glyph');continue;}
   assert.ok(run.caretGeometry,'Prepared painting must expose caret geometry from the same physical font and glyph positions.');
   const geometry=run.caretGeometry;
   font.setScale(run.unitsPerEm,run.unitsPerEm);
   assert.equal(geometry.direction,'ltr');
   const offsets=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(part=>part.index).concat(text.length);
   assert.deepEqual(geometry.stops.map(stop=>stop.offset),offsets,'One stop at each original grapheme boundary, including ligature interiors');
   assert.equal(geometry.stops[0].x,0);assert.equal(geometry.stops.at(-1).x,run.width*run.unitsPerEm);
   assert.deepEqual([geometry.ascent,geometry.descent],[font.hExtents().ascender,font.hExtents().descender]);
   let pen=0;
   for(const glyph of run.glyphs){
    const inside=offsets.filter(offset=>offset>glyph.sourceStart&&offset<glyph.sourceEnd);
    const carets=font.getLigatureCarets(hb.Direction.LTR,glyph.id);
    if(inside.length&&carets.length===inside.length){
     for(const [index,offset]of inside.entries()){
      const stop=geometry.stops.find(stop=>stop.offset===offset);
      assert.equal(stop.basis,'font');assert.equal(stop.x,pen+glyph.xOffset+carets[index]);fontCarets++;
     }
    }
    pen+=glyph.xAdvance;
   }
   interpolated+=geometry.stops.filter(stop=>stop.basis==='interpolated').length;
   for(const stop of geometry.stops){assert.ok(Number.isFinite(stop.x));assert.ok(['cluster','font','interpolated'].includes(stop.basis));}
   records.push({...style,text,geometry:structuredClone(geometry)});
   geometry.stops[0].x=Infinity;geometry.ascent=Infinity;
   assert.ok(Number.isFinite(prepared.registry.textPainting.shape(text,style).caretGeometry.stops[0].x),'Caller edits cannot alter the next result');
  }
 }
 assert.ok(fontCarets>0);assert.ok(interpolated>0);
 // Verify the generated direction data against the actual pinned WASM, even
 // for characters absent from the selected font. .notdef still retains clusters.
 const entry=prepared.registry.embeddedFonts.find(entry=>entry.family==='Arimo'&&!entry.italic&&entry.weight===400);
 const bytes=Buffer.from(entry.dataUrl.split(',')[1],'base64');
 const font=new hb.Font(new hb.Face(new hb.Blob(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))));
 let directionCases=0;
 for(const [start,end]of scriptDirectionRanges)for(const cp of new Set([start,end])){
  const text=String.fromCodePoint(cp)+'A';const buffer=new hb.Buffer();buffer.addText(text);buffer.guessSegmentProperties();hb.shape(font,buffer);
  const clusters=[...new Set(buffer.getGlyphInfos().map(info=>info.cluster))];
  if(clusters.length<2)continue;
  assert.equal(shapingDirection(text),clusters[0]>clusters.at(-1)?'rtl':'ltr',`Direction U+${cp.toString(16)}`);directionCases++;
 }
 for(const tag of rtlScriptTags){assert.equal(shapingDirection('A',{script:tag}),'rtl');assert.equal(shapingDirection('A',{script:tag.toLowerCase()}),'rtl');}
 assert.equal(shapingDirection('A',{direction:'rtl'}),'rtl');
 for(const text of ['','  ','\u0301','Aא','\u200fA'])assert.equal(shapingDirection(text),'ltr');
 for(const text of ['א','אב','\u0301א'])assert.equal(shapingDirection(text),'rtl');
 for(const text of ['א','אב','אָב']){
  const run=prepared.registry.textPainting.shape(text,{fontFamily:'Arimo',fontWeight:400});
  assert.equal(run.caretGeometry.direction,'rtl');
  assert.equal(run.caretGeometry.stops[0].x,run.width*run.unitsPerEm);
  assert.equal(run.caretGeometry.stops.at(-1).x,0);
 }
 const report={node:process.version,engine:prepared.registry.textPainting.shape('A',{fontFamily:'Arimo'}).engine,
  cases:records.length,fontCarets,interpolated,directionCases,records,
  boundary:'Single shaped horizontal runs and original grapheme boundaries. Missing font caret data is explicitly interpolated. This does not establish paragraph bidi or native Office compatibility.'};
 await writeFile(new URL('node.json',output),JSON.stringify(report,null,2)+'\n');
 console.log(`Prepared carets: ${records.length} face/text cases, ${fontCarets} independently checked font carets, ${interpolated} explicit interpolations and ${directionCases} WASM direction comparisons.`);
}finally{prepared.registry.dispose();}
