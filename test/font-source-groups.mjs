import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fitRichText} from '@openpresentation/opf/composition';
import {prepareNodeFonts} from '../dist/fonts-node.js';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {renderSvg,resolvePresentation} from '../dist/svg.js';

const prepared=await prepareNodeFonts({pack:'office',fontShaper:await loadHarfBuzzShaper()});
const options={...prepared.options,trace:true},records=[];
const decode=text=>text.replaceAll('&quot;','"').replaceAll('&amp;','&');
const maps=svg=>[...svg.matchAll(/data-opf-caret-map="([^"]*)"/g)].map(match=>JSON.parse(decode(match[1])));
const deck=(family,runs)=>({design:{fontScheme:{id:'roboto',heading:{family},body:{family},code:{family}}},slides:[{text:runs}]});
try{
 for(const [family,texts]of [['Arimo',['A','V']],['Gelasio',['of','fice']],['Arimo',['A','\u0301B']],['Arimo',['אָ','ב']]]){
  const whole=texts.join(''),runs=texts.map(text=>({text,fontSize:24,color:'#123456'})),source=structuredClone(runs);
  const split=deck(family,runs),single=deck(family,[{...runs[0],text:whole}]);
  const before=resolvePresentation(single,options).slides[0].geometry.items[0].text;
  const after=resolvePresentation(split,options).slides[0].geometry.items[0].text;
  assert.deepEqual(after.lines,before.lines);assert.deepEqual(after.placement,before.placement);
  const group=after.richLines[0].fragments[0];assert.equal(after.richLines[0].fragments.length,1);
  assert.equal(group.text,whole);assert.deepEqual(group.sources.map(span=>[span.runIndex,span.start,span.end]),texts.map((text,index)=>[index,0,text.length]));
  assert.ok(!('runIndex' in group),'A shaping group cannot pretend to be a slice of its first source run');
  const expected=renderSvg(single,options),actual=renderSvg(split,options);
  assert.deepEqual(maps(actual),maps(expected),'Joint shaping supplies the same caret positions');
  const paths=svg=>[...svg.matchAll(/<path\b[^>]*data-opf-glyph-id[^>]*>/g)].map(match=>match[0]);
  assert.deepEqual(paths(actual),paths(expected),'Joint shaping supplies identical glyph IDs, paths, positions and source clusters');
  for(const width of [group.width,group.width-.5,group.width/2]){
   const box={x:0,y:0,width,height:500},style={fontFamily:family,fontWeight:400};
   const actual=fitRichText(runs,box,32,32,{style,textMeasurement:prepared.registry.textMeasurement});
   const expected=fitRichText([{...runs[0],text:whole}],box,32,32,{style,textMeasurement:prepared.registry.textMeasurement});
   assert.deepEqual(actual.lines,expected.lines);assert.deepEqual(actual.richLines.map(line=>line.width),expected.richLines.map(line=>line.width));
  }
  assert.deepEqual(runs,source);records.push({family,whole,texts,width:group.width,maps:maps(actual)});
 }
 const colors=[{text:'of',color:'#CC2222',underline:true,link:'https://example.org'},{text:'fice',color:'#2222CC',strikethrough:true}];
 const colored=deck('Gelasio',colors),coloredSource=structuredClone(colored);
 const colorFit=resolvePresentation(colored,options).slides[0].geometry.items[0].text;
 const plainFit=resolvePresentation(deck('Gelasio',[{text:'office'}]),options).slides[0].geometry.items[0].text;
 assert.deepEqual(colorFit.placement,plainFit.placement,'Paint and link changes do not change shaping or accepted geometry');
 const svg=renderSvg(colored,options);
 assert.match(svg,/<clipPath /,'A ligature crossing a color boundary shares the glyph and clips its colors');
 assert.match(svg,/href="https:\/\/example.org"/);assert.match(svg,/data-opf-text-decoration="underline"/);assert.match(svg,/data-opf-text-decoration="strikethrough"/);
 assert.equal(maps(svg).filter(map=>map.end===6).length,1,'One full shaped run owns its caret map');
 assert.deepEqual(colored,coloredSource);
 const output=new URL('../artifacts/font-shaping/source-groups/',import.meta.url);await mkdir(output,{recursive:true});
 await writeFile(new URL('node.json',output),JSON.stringify({node:process.version,records,colored:{source:colors,placement:colorFit.placement,maps:maps(svg)}},null,2)+'\n');
 await writeFile(new URL('colored.svg',output),svg);
 console.log('Cross-run shaping: kerning, ligatures, combining marks, RTL carets, wrapping, source spans and paint boundaries pass.');
}finally{prepared.registry.dispose();}
