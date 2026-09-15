import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import wawoff2 from 'wawoff2';
import {create} from 'fontkit';
import {loadBundledFontRegistry} from '../dist/fonts-node.js';
import {createFontRegistry} from '../dist/fonts.js';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {withGlyfLengthHint} from './font-container-fixtures.mjs';

const bundled=await loadBundledFontRegistry(),service=await loadHarfBuzzShaper();
const face=bundled.embeddedFonts.find(face=>face.family==='Roboto'&&face.weight===400&&!face.italic);
const original=Buffer.from(face.dataUrl.split(',')[1],'base64'),woff2=Buffer.from(await wawoff2.compress(original));
const source=createFontRegistry([{data:original,family:'Fixture'}],{fontShaper:service});
const text='office AVATAR e\u0301',style={fontFamily:'Fixture'},expected=source.shapeText(text,style),cases=[];
for(const hint of [1,1000000]) {
  const data=withGlyfLengthHint(woff2,hint);
  // The independent Google decoder must accept the unchanged glyph stream too.
  const google=Buffer.from(await wawoff2.decompress(data));
  assert.equal(create(google).postscriptName,create(original).postscriptName);
  const selected=createFontRegistry([{data,family:'Fixture'}],{fontShaper:service,maxPreparedFontBytes:256*1024});
  assert.deepEqual(selected.shapeText(text,style),expected);
  const prepared=service.prepareFontData(data,256*1024).data;
  assert.ok(prepared.length<256*1024);
  assert.throws(()=>service.prepareFontData(data,data.length+1),{code:'font-size-limit'});
  cases.push({hint,sourceSha256:createHash('sha256').update(data).digest('hex'),preparedBytes:prepared.length,googleBytes:google.length,sourceRanges:expected.glyphs.map(g=>[g.sourceStart,g.sourceEnd])});
  selected.dispose();
}
source.dispose();bundled.dispose();
await mkdir('artifacts/font-shaping',{recursive:true});await writeFile('artifacts/font-shaping/reconstruction.json',JSON.stringify({node:process.version,cases},null,2)+'\n');
console.log('WOFF2 reconstruction: tiny/oversized glyph length hints match Google acceptance and original glyphs; actual decoded-size limits still reject.');
