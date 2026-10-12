import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolvePresentation,toSvg} from '../dist/svg.js';
import {gallery} from '@openpresentation/gallery';
const deck={slides:[{layout:'text',title:'Region title',blocks:[{text:'Region alignment probe'}]}]};
const bound=resolvePresentation(deck,{catalogs:[gallery]}).slides[0];
assert.ok(!Object.hasOwn(bound,'titleBindings'),'v1 title bindings are not exposed');
assert.ok(bound.geometry.regions.some(region=>region.name==='body'),'v2 body region geometry remains available');
assert.deepEqual(bound.blocks,[{type:'text',field:'text',value:'Region alignment probe',path:'slides.0.blocks.0.text'}]);
for(const item of [...bound.contentItems,...bound.blocks]){
 assert.ok(!Object.hasOwn(item,'slot')&&!Object.hasOwn(item,'placeholderIndex'),'legacy binding metadata is absent');
}
assert.match(toSvg(deck,{catalogs:[gallery]})[0],/Region alignment probe/);
for(const file of ['index.d.ts','svg.d.ts']){
 const types=await readFile(new URL('../dist/'+file,import.meta.url),'utf8');
 assert.doesNotMatch(types,/titleBindings|placeholderIndex|\bslot\?:/,'published declarations omit obsolete binding fields');
}
console.log('Public v2 binding metadata: removed title/slot/placeholder fields; authored body and actual region geometry retained.');
