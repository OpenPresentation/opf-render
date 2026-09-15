import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {createFontRegistry} from '../dist/fonts.js';
import {loadOfficeFontRegistry, prepareNodeFonts} from '../dist/fonts-node.js';

const shaper = await loadHarfBuzzShaper();
assert.equal(shaper.engine, 'harfbuzz:14.4.0');
const fonts = await loadOfficeFontRegistry({fontShaper:shaper, substitutionPolicy:'visual'});
const original = await loadOfficeFontRegistry({substitutionPolicy:'visual'});
assert.deepEqual(fonts.embeddedFonts, original.embeddedFonts);
assert.equal(fonts.embeddedFonts.length, 33);
const samples = ['AVATAR office affine', '  Keep spaces  ', 'Ágj', 'o\u0302\u0301', 'ω\u0301', 'Ι\u0301', '', '   '];
const results = [];
for (const face of fonts.embeddedFonts) {
  const style = {fontFamily:face.family, fontWeight:face.weight, italic:face.italic};
  assert.deepEqual(fonts.resolveFont(style), original.resolveFont(style));
  for (const text of samples) {
    try { original.textMeasurement.measure(text,32,style); }
    catch (error) {
      assert.equal(error.code,'missing-glyph');
      assert.throws(()=>fonts.shapeText(text,style),{code:'missing-glyph'});
      results.push({style,text,rejected:'missing-glyph'});
      continue;
    }
    const run = fonts.shapeText(text, style);
    assert.equal(run.text, text);
    assert.ok(Number.isFinite(run.width));
    assert.equal(run.width * 32, fonts.textMeasurement.measure(text,32,style));
    const bounds = fonts.textMeasurement.outlineBounds(text,32,style);
    assert.deepEqual(bounds, run.outline && Object.fromEntries(Object.entries(run.outline).map(([key,value]) => [key,value*32])));
    for (const glyph of run.glyphs) {
      assert.equal(glyph.cluster,glyph.sourceStart);
      assert.ok(glyph.sourceStart >= 0 && glyph.sourceEnd <= text.length && glyph.sourceEnd > glyph.sourceStart);
      assert.ok(text.slice(glyph.sourceStart,glyph.sourceEnd).isWellFormed());
    }
    if (!text.trim()) assert.equal(bounds,null);
    // Mutation of public shape/outline results must never corrupt cached layout.
    run.width = -100; if (run.glyphs[0]) run.glyphs[0].id = -100;
    assert.notEqual(fonts.shapeText(text,style).width,-100);
    assert.notEqual(fonts.shapeText(text,style).glyphs[0]?.id,-100);
    if (bounds) {bounds.x=Infinity;assert.ok(Number.isFinite(fonts.textMeasurement.outlineBounds(text,32,style).x));}
    results.push({style,text,width:fonts.textMeasurement.measure(text,32,style),previousWidth:original.textMeasurement.measure(text,32,style)});
  }
}
const style = {fontFamily:'Carlito',fontWeight:700};
assert.equal(fonts.textMeasurement.measure('narrow',40.5,style),121.8955078125);
assert.ok(fonts.textMeasurement.outlineBounds('j',25,{fontFamily:'Carlito',italic:true}).x < 0);
assert.deepEqual(fonts.resolveFont({fontFamily:'Aptos',fontWeight:700}),original.resolveFont({fontFamily:'Aptos',fontWeight:700}));
for (const api of [fonts.textMeasurement.measure,fonts.textMeasurement.outlineBounds]) {
  for (const size of [0, -1, NaN, Infinity]) assert.throws(()=>api('text',size,style),{code:'invalid-text-measurement'});
  assert.throws(()=>api('你好',32,style),{code:'missing-glyph'});
  assert.throws(()=>api('text',32,{fontFamily:'Missing'}),{code:'font-unavailable'});
}
const source = fonts.embeddedFonts.find(face => face.family==='Roboto' && face.weight===400 && !face.italic);
const data = new Uint8Array(Buffer.from(source.dataUrl.split(',')[1],'base64'));
const entry = {data,family:'Fixture',license:source.license};
const mutable=Buffer.from(data);
const ownedDefault=createFontRegistry([{...entry,data:mutable}]);
const ownedShaped=createFontRegistry([{...entry,data:mutable}],{fontShaper:shaper});
const expectedDefault=createFontRegistry([entry]);
mutable.fill(0);
assert.equal(ownedDefault.textMeasurement.measure('office',32,{fontFamily:'Fixture'}),expectedDefault.textMeasurement.measure('office',32,{fontFamily:'Fixture'}));
assert.ok(ownedShaped.textMeasurement.measure('office',32,{fontFamily:'Fixture'})>0);
assert.deepEqual(ownedShaped.embeddedFonts,expectedDefault.embeddedFonts,'Supplied Buffer mutation must not alter embedding or lazy font parsing');
const test = createFontRegistry([entry],{fontShaper:shaper,strictGlyphs:false});
const mixed = 'A😀o\u0302\u0301Z';
const run = test.shapeText(mixed,{fontFamily:'Fixture'});
assert.deepEqual([...new Set(run.glyphs.map(glyph=>glyph.cluster))],[0,1,3,6]);
assert.ok(run.glyphs.some(glyph=>glyph.id===0),'Deliberate missing emoji remains visible as missing glyph');
assert.throws(()=>test.shapeText('\ud800',{fontFamily:'Fixture'}),{code:'invalid-shaping-text'});
assert.throws(()=>test.textMeasurement.measure('\ud800',20,{fontFamily:'Fixture'}),{code:'invalid-shaping-text'});
const plain = createFontRegistry([entry],{fontShaper:await loadHarfBuzzShaper({features:['liga=0']}),strictGlyphs:false});
assert.ok(plain.shapeText('office',{fontFamily:'Fixture'}).glyphs.length > test.shapeText('office',{fontFamily:'Fixture'}).glyphs.length);
const backwards = createFontRegistry([entry],{fontShaper:await loadHarfBuzzShaper({direction:'rtl',script:'Latn'}),strictGlyphs:false});
assert.deepEqual(backwards.shapeText('abc',{fontFamily:'Fixture'}).glyphs.map(g=>g.cluster),[2,1,0]);
for (const [options,code] of [[{language:''},'invalid-shaping-language'],[{script:'Latin'},'invalid-shaping-script'],[{direction:'ttb'},'invalid-shaping-direction'],[{features:['not a feature']},'invalid-shaping-feature']])
  await assert.rejects(loadHarfBuzzShaper(options),{code});

// Count actual backend work, including the bounded cache and original data ownership.
let calls = 0, disposals = 0;
const counted = {...shaper,createFace(input){const face=shaper.createFace(input);return {shape(text){calls++;return face.shape(text);},dispose(){disposals++;face.dispose();}};}};
const cached = createFontRegistry([entry],{fontShaper:counted});
const fixture = {fontFamily:'Fixture'};
cached.textMeasurement.measure('one',20,fixture);
cached.textMeasurement.outlineBounds('one',40,fixture);
assert.equal(calls,1,'Advance and ink use a single shared shaped run');
for (let index=0;index<513;index++) cached.textMeasurement.measure(String(index),20,fixture);
const before = calls;
cached.textMeasurement.measure('one',20,fixture);assert.equal(calls,before+1);
cached.textMeasurement.measure('x'.repeat(2049),20,fixture);
cached.textMeasurement.measure('x'.repeat(2049),20,fixture);assert.equal(calls,before+3);
for(let index=0;index<5;index++)cached.textMeasurement.measure('x'.repeat(1999)+index,20,fixture);
const glyphBudgetCalls=calls;
cached.textMeasurement.measure('x'.repeat(1999)+'0',20,fixture);
assert.equal(calls,glyphBudgetCalls+1,'Cached glyph objects are bounded independently of the entry count');
cached.dispose();cached.dispose();assert.equal(disposals,1);
assert.throws(()=>cached.textMeasurement.measure('one',20,fixture),{code:'font-registry-disposed'});
assert.ok(test.textMeasurement.measure('one',20,fixture)>0,'Disposing one registry leaves other owners active');
const prepared = await prepareNodeFonts({fontShaper:shaper});
assert.equal(prepared.options.textMeasurement,prepared.registry.textMeasurement);
assert.equal(prepared.options.loadSystemFonts,false);

const output = new URL('../artifacts/font-shaping/',import.meta.url);
await mkdir(output,{recursive:true});
await writeFile(new URL('node.json',output),JSON.stringify({node:process.version,engine:shaper.engine,faces:33,cases:results.length,
  files:await Promise.all(fonts.fontFiles.map(async file=>({file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')}))),
  results,boundary:'Opt-in SFNT horizontal run service; no default, raster baseline, native, bidi or compressed-format acceptance.'},null,2)+'\n');
for (const registry of [fonts,original,test,plain,backwards,prepared.registry,ownedDefault,ownedShaped,expectedDefault]) registry.dispose();
console.log(`HarfBuzz registry: ${results.length} cases across 33 pinned faces; exact original UTF-16 ranges, same-run advances/ink, physical selection, policies, cache bounds, features and owned disposal passed.`);
