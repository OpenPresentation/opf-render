import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as hb from 'harfbuzzjs';
import {createFontRegistry} from '../dist/fonts.js';
import {prepareNodeFonts} from '../dist/fonts-node.js';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {renderSvgDeck,renderSvg,resolvePresentation} from '../dist/svg.js';
import {fontFixtures,instanceCases} from './font-variations-fixtures.mjs';
import {paintingDeck} from './font-painting-fixtures.mjs';

const output=new URL('../artifacts/font-shaping/painting/',import.meta.url);
await mkdir(output,{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex');
const service=await loadHarfBuzzShaper();
const prepared=await prepareNodeFonts({pack:'office',fontShaper:service});
assert.equal(prepared.options.textPainting,prepared.registry.textPainting);
assert.equal(prepared.options.textPainting.textMeasurement,prepared.options.textMeasurement);
const records=[];
const texts=['AVATAR office affine','  Keep spaces  ','o\u0302\u0301'];
function check(registry,text,style,source,reference) {
  let shaped;
  try {shaped=registry.shapeText(text,style);}
  catch(error) {
    assert.equal(error.code,'missing-glyph');
    assert.throws(()=>registry.textPainting.shape(text,style),{code:'missing-glyph'});
    records.push({...source,text,rejected:'missing-glyph'});return;
  }
  const painted=registry.textPainting.shape(text,style);
  const {decorations,caretGeometry,...withoutPaths}=painted;
  withoutPaths.glyphs=painted.glyphs.map(({path,...glyph})=>glyph);
  assert.deepEqual(withoutPaths,shaped,'Painting retains the measured run and original source offsets');
  assert.equal(painted.width,registry.textMeasurement.measure(text,1,style));
  assert.equal(painted.glyphs.reduce((sum,g)=>sum+g.xAdvance,0)/painted.unitsPerEm,painted.width);
  if(reference)for(const glyph of painted.glyphs)
    assert.equal(glyph.path,reference.glyphToPath(glyph.id),'Draw the selected original physical glyph');
  assert.ok(painted.glyphs.some(glyph=>glyph.path.length),'Require visible vector ink');
  if(text.includes('  '))assert.ok(painted.glyphs.some(glyph=>!glyph.path),'Spaces retain advances without invented ink');
  for(const name of ['underline','strikethrough']) {
    assert.ok(Number.isFinite(decorations[name].offset));assert.ok(decorations[name].thickness>0);
  }
  records.push({...source,text,glyphs:painted.glyphs.length,width:painted.width,
    pathsSha256:hash(JSON.stringify(painted.glyphs)),decorations});
  painted.glyphs[0].path='M0 0';painted.glyphs[0].id=-1;decorations.underline.offset=Infinity;
  const again=registry.textPainting.shape(text,style);
  assert.notEqual(again.glyphs[0].id,-1);assert.ok(Number.isFinite(again.decorations.underline.offset));
  assert.deepEqual(registry.shapeText(text,style),shaped,'Painting never enlarges or mutates the measurement cache');
}
for(const face of prepared.registry.embeddedFonts) {
  const style={fontFamily:face.family,fontWeight:face.weight,italic:face.italic};
  for(const text of texts)check(prepared.registry,text,style,{family:face.family,weight:face.weight,italic:face.italic});
}
for(const record of (await fontFixtures()).filter(record=>Object.keys(record.axes).length)) {
  const blob=new hb.Blob(record.data.buffer.slice(record.data.byteOffset,record.data.byteOffset+record.data.byteLength));
  const face=new hb.Face(blob),reference=new hb.Font(face);reference.setScale(face.upem,face.upem);
  for(const instance of instanceCases(record)) {
    reference.setVariations(Object.entries(instance.coordinates).map(([tag,value])=>new hb.Variation(tag,value)));
    const registry=createFontRegistry([{data:record.data,family:'Fixture',italic:record.italic,license:record.license,variations:instance.coordinates}],{fontShaper:service});
    for(const text of texts)check(registry,text,{fontFamily:'Fixture',fontWeight:400,italic:record.italic},
      {file:record.file,id:instance.id,coordinates:instance.coordinates,sourceSha256:hash(record.data)},reference);
    registry.dispose();assert.throws(()=>registry.textPainting.shape('H',{fontFamily:'Fixture'}),{code:'font-registry-disposed'});
  }
}
const before=structuredClone(paintingDeck);
const options={...prepared.options,trace:true,embeddedFonts:prepared.registry.embeddedFonts.filter(face=>['Arimo','Cousine'].includes(face.family))};
const native={...options};delete native.textPainting;
assert.deepEqual(resolvePresentation(paintingDeck,options),resolvePresentation(paintingDeck,native),'Painting leaves accepted layout unchanged');
const svgs=renderSvgDeck(paintingDeck,options);
const logical=svg=>[...svg.matchAll(/<text\b([^>]*?)(?:\/>|>[\s\S]*?<\/text>)/g)].map(([text])=>text
  .replace(' data-opf-logical-text="1"','').replace(' fill-opacity="0"','').replace(' pointer-events="all"',''));
const nativeSvgs=renderSvgDeck(paintingDeck,native);
for(const [index,svg]of svgs.entries()) {
  assert.deepEqual(logical(svg),logical(nativeSvgs[index]),'Keep logical text, links, source ranges, styles and whitespace unchanged');
  assert.ok(svg.includes('data-opf-glyph-paint='));
  assert.ok(svg.includes('data-opf-glyph-source-start='));
  assert.ok(!/<g\b[^>]*data-opf-glyph-paint=[^>]*textLength=/.test(svg));
  await writeFile(new URL(`slide-${index+1}.svg`,output),svg);
}
assert.deepEqual(paintingDeck,before);
assert.throws(()=>renderSvg(paintingDeck,{...options,textMeasurement:{...options.textMeasurement}}),{code:'invalid-text-painting'});
const face=prepared.registry.embeddedFonts.find(face=>face.family==='Arimo'&&face.weight===400&&!face.italic);
const entry={data:Buffer.from(face.dataUrl.split(',')[1],'base64'),family:'Fixture'};
for(const path of ['<script/>','M1e999 0']) {
  const invalid=createFontRegistry([entry],{fontShaper:{...service,createFace(input){return {...service.createFace(input),glyphPath:()=>path};}}});
  assert.throws(()=>invalid.textPainting.shape('H',{fontFamily:'Fixture'}),{code:'invalid-shaped-paint'});invalid.dispose();
}
const report={node:process.version,engine:service.engine,cases:records.length,accepted:records.filter(row=>!row.rejected).length,
  coverageRejections:records.filter(row=>row.rejected).length,slides:svgs.length,records,
  scope:'Selected glyph paths and measured positions, original logical SVG text, unchanged shared geometry. Browser, caret, installed-package and native acceptance are separate.'};
await writeFile(new URL('node.json',output),JSON.stringify(report,null,2)+'\n');
prepared.registry.dispose();
console.log(`Shaped painting: ${report.accepted} source-preserving glyph runs, ${report.coverageRejections} explicit coverage rejections and ${report.slides} unchanged-layout/logical-text slides.`);
