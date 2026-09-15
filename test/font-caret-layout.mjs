import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {prepareNodeFonts} from '../dist/fonts-node.js';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {renderSvg,resolvePresentation} from '../dist/svg.js';

const prepared=await prepareNodeFonts({pack:'office',fontShaper:await loadHarfBuzzShaper()});
const options={...prepared.options,trace:true},records=[];
try{
 for(const text of ['A\t\tB','\t\t'])for(const rich of [false,true]){
  const value=rich?[{text,fontSize:24,underline:true}]:text;
  const document={design:{fontScheme:{id:'roboto',heading:{family:'Arimo'},body:{family:'Arimo'},code:{family:'Arimo'}}},slides:[{text:value}]};
  const original=structuredClone(document),item=resolvePresentation(document,options).slides[0].geometry.items[0];
  const svg=renderSvg(document,options);
  const maps=[...svg.matchAll(/data-opf-caret-map="([^"]*)"/g)].map(match=>JSON.parse(match[1].replaceAll('&quot;','"')));
  const tabs=maps.filter(map=>map.stops[0].basis==='layout');assert.equal(tabs.length,2);
  const line=item.text.placement.lines[0];
  const segments=rich?item.text.richLines[0].fragments:item.text.sourceLines[0].segments;
  for(const segment of segments.filter(segment=>segment.kind==='tab')){
   const map=tabs.find(map=>map.start===segment.start);assert.ok(map);
   assert.equal(map.end,segment.end);
   assert.equal(map.stops[0].x,line.x+segment.x);
   assert.equal(map.stops[1].x,line.x+segment.x+segment.width);
   assert.equal(map.direction,'ltr');assert.ok(map.bottom>map.top);
  }
  if(rich){
   const tabGroups=[...svg.matchAll(/<g[^>]*data-opf-caret-map="([^"]*)"[^>]*>([\s\S]*?)<\/g>/g)].filter(match=>JSON.parse(match[1].replaceAll('&quot;','"')).stops[0].basis==='layout');
   assert.equal(tabGroups.length,2);for(const match of tabGroups){
    assert.ok(!match[2].includes('<path'),'A tab has no invented font glyph');
    assert.match(match[2],/data-opf-text-decoration="underline"/);
    assert.ok(Number(/width="([^"]+)"/.exec(match[2])[1])>0,'Tab underline has a positive accepted advance');
   }
  }
  assert.deepEqual(document,original);records.push({text,rich,tabs});
 }
 const rtl={design:{fontScheme:{id:'roboto',heading:{family:'Arimo'},body:{family:'Arimo'},code:{family:'Arimo'}}},slides:[{text:'אָב'}]};
 const maps=[...renderSvg(rtl,options).matchAll(/data-opf-caret-map="([^"]*)"/g)].map(match=>JSON.parse(match[1].replaceAll('&quot;','"')));
 assert.ok(maps.length);assert.ok(maps.every(map=>map.direction==='rtl'));
 const output=new URL('../artifacts/font-shaping/carets/',import.meta.url);await mkdir(output,{recursive:true});
 await writeFile(new URL('layout.json',output),JSON.stringify({node:process.version,records,rtlMaps:maps},null,2)+'\n');
 console.log('Prepared caret layout: scalar/rich consecutive and tab-only advances, decorations and resolved RTL direction match shared layout.');
}finally{prepared.registry.dispose();}
