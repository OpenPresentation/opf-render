import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fitText} from '@openpresentation/opf/composition';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {createFontRegistry} from '../dist/fonts.js';

const [fontDirectory,evidenceDirectory,outputDirectory]=process.argv.slice(2);
if(!fontDirectory||!evidenceDirectory||!outputDirectory)throw new Error('Usage: node test/font-shaping-akasia.mjs LICENSED_AKASIA_DIRECTORY CORE_STUDY_DIRECTORY NEW_OUTPUT_DIRECTORY');
await mkdir(outputDirectory); // Preserve previous evidence rather than overwriting it.
const sourceBytes=await readFile(path.join(evidenceDirectory,'fontkit-matrix.json'));
const expectedBytes=await readFile(path.join(evidenceDirectory,'javascript-matrix.json'));
const source=JSON.parse(sourceBytes),expected=JSON.parse(expectedBytes);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(expected.sourceSha256,hash(sourceBytes));
const entries=await Promise.all(source.faces.map(async face=>{
  const data=await readFile(path.join(fontDirectory,face.file));assert.equal(hash(data),face.sha256);
  return {data,family:face.id,weight:face.weight,italic:face.italic};
}));
const registry=createFontRegistry(entries,{fontShaper:await loadHarfBuzzShaper()});
const style=id=>{const face=source.faces.find(face=>face.id===id);return {fontFamily:id,fontWeight:face.weight,italic:face.italic};};
assert.equal(source.samples.length,8568);
for(const [index,item]of source.samples.entries()){
  const run=registry.shapeText(item.text,style(item.face)),reference=expected.results[index];
  assert.equal(item.id,reference.id);assert.equal(run.text,item.text);
  assert.deepEqual(run.glyphs.map(({sourceStart,sourceEnd,...glyph})=>glyph),reference.glyphs);
  assert.equal(run.width,reference.width);assert.deepEqual(run.outline,reference.outline);
  assert.equal(registry.textMeasurement.measure(item.text,32,style(item.face)),reference.harfbuzzAt32);
}
const fits=expected.fits.map(item=>{
  const fit=fitText(item.text,item.box,32,32,(text,size)=>registry.textMeasurement.measure(text,size,style(item.face)));
  assert.deepEqual(fit,item.after);
  assert.equal(fit.sourceLines.map(line=>item.text.slice(line.start,line.nextStart)).join(''),item.text);
  return {id:item.id,source:item.text,fontSize:fit.fontSize,lines:fit.lines,sourceLines:fit.sourceLines};
});
await writeFile(path.join(outputDirectory,'report.json'),JSON.stringify({node:process.version,engine:'harfbuzz:14.4.0',cases:8568,
  inputs:{matrix:hash(sourceBytes),reference:hash(expectedBytes)},faces:source.faces,fits,
  scope:'Actual production registry and core fitText match the earlier 8568-case probe; original source ranges and fixed 32px floor retained. Not default/backend promotion or native acceptance.'},null,2)+'\n');
registry.dispose();console.log('Akasia production registry: all 8568 prior glyph runs/metrics and three original-source wrapping fixtures agree exactly.');
