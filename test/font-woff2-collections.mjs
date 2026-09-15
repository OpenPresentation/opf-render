import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {create} from 'fontkit';
import wawoff2 from 'wawoff2';
import {loadOfficeFontRegistry} from '../dist/fonts-node.js';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {createFontRegistry} from '../dist/fonts.js';
import {fontTables} from './font-container-fixtures.mjs';
import {metricsVariant,collectionFixture,readWoff2,literalGlyphs} from './font-woff2-collections-fixtures.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const tablesAt=(font,index)=>{
  const start=font.readUInt32BE(12+index*4),tables=new Map();
  for(let i=0;i<font.readUInt16BE(start+4);i++){
    const record=start+12+i*16,offset=font.readUInt32BE(record+8),length=font.readUInt32BE(record+12);
    tables.set(font.toString('ascii',record,record+4),font.subarray(offset,offset+length));
  }
  return tables;
};
const bundled=await loadOfficeFontRegistry(),shaper=await loadHarfBuzzShaper(),cases=[],controls=[],failures=[];
const directory='artifacts/font-shaping/collection-inputs';await mkdir(directory,{recursive:true});
let index=0;
for(const face of bundled.embeddedFonts){
  const original=Buffer.from(face.dataUrl.split(',')[1],'base64'),variant=metricsVariant(original,index);
  const fonts=[original,variant.data],fixture=await collectionFixture(fonts);
  for(let fontIndex=0;fontIndex<fonts.length;fontIndex++){
    assert.deepEqual(tablesAt(fixture.googleReference,fontIndex).get('hmtx'),fontTables(fonts[fontIndex]).get('hmtx'),'Independent Google baseline preserves both metric tables');
    assert.equal(create(fixture.googleReference).fonts[fontIndex].postscriptName,create(fonts[fontIndex]).postscriptName);
    await writeFile(`${directory}/${index}-${fontIndex}.ttf`,fonts[fontIndex]);
  }
  await writeFile(`${directory}/${index}.ttc`,fixture.source);await writeFile(`${directory}/${index}-baseline.woff2`,fixture.baseline);
  const structure=readWoff2(fixture.baseline);
  assert.equal(new Set(structure.faces.map(font=>font.indices.find(i=>structure.entries[i].tag==='glyf'))).size,1);
  assert.equal(new Set(structure.faces.map(font=>font.indices.find(i=>structure.entries[i].tag==='hmtx'))).size,2,'Shared glyphs must not mean shared advances');
  const style={fontFamily:'Fixture',fontWeight:face.weight,italic:face.italic},text='office AVATAR  123';
  const references=fonts.map(data=>createFontRegistry([{data,family:'Fixture',weight:face.weight,italic:face.italic}],{fontShaper:shaper}));
  assert.notEqual(references[0].shapeText(text,style).width,references[1].shapeText(text,style).width,'Physical-face selection must be observable');
  for(const flags of [1,2,3]){
    const data=fixture.transform(flags,{firstRaw:flags===2}),file=`${index}-${flags}.woff2`;
    await writeFile(`${directory}/${file}`,data);
    let googleAccepted=false;try{await wawoff2.decompress(data);googleAccepted=true;}catch{}
    const prepared=Buffer.from(shaper.prepareFontData(data).data);
    for(const [fontIndex,reference]of references.entries()){
      const expected=fontTables(fonts[fontIndex]).get('hmtx'),actual=tablesAt(prepared,fontIndex).get('hmtx');
      assert.deepEqual(actual,expected,`${face.family}/${face.weight}/${flags}/${fontIndex}: every selected metric`);
      const postscriptName=create(fonts[fontIndex]).postscriptName;
      const registry=createFontRegistry([{data,postscriptName,family:'Fixture',weight:face.weight,italic:face.italic,license:face.license}],{fontShaper:shaper});
      assert.deepEqual(registry.shapeText(text,style),reference.shapeText(text,style));
      assert.deepEqual(fontTables(Buffer.from(registry.embeddedFonts[0].dataUrl.split(',')[1],'base64')).get('hmtx'),expected);
      assert.equal(registry.fontPreparations[0].selectedCollectionFace,true);
      assert.equal(registry.fontPreparations[0].postscriptName,postscriptName);
      assert.equal(registry.embeddedFonts[0].license,face.license);
      cases.push({family:face.family,weight:face.weight,italic:face.italic,flags,firstRaw:flags===2,fontIndex,postscriptName,file,sha256:hash(data),sourceFile:`${index}-${fontIndex}.ttf`,sourceSha256:hash(fonts[fontIndex]),googleAccepted});
      registry.dispose();
    }
  }
  references.forEach(registry=>registry.dispose());index++;
}
const source=Buffer.from(bundled.embeddedFonts[0].dataUrl.split(',')[1],'base64');
const sameMetrics=metricsVariant(source,'Shared',{delta:0,expand:false}),sameFixture=await collectionFixture([source,sameMetrics.data]);
for(const flags of [1,2,3]){
  const data=sameFixture.transform(flags),prepared=Buffer.from(shaper.prepareFontData(data).data);
  assert.deepEqual(tablesAt(prepared,0).get('hmtx'),tablesAt(prepared,1).get('hmtx'));
  controls.push({name:'shared glyph and metric tables',flags});
}
const rawData=sameFixture.transform(3,{edit:container=>literalGlyphs(container,source)});
const rawPrepared=Buffer.from(shaper.prepareFontData(rawData).data);
for(const index of [0,1])assert.deepEqual(tablesAt(rawPrepared,index).get('hmtx'),fontTables(source).get('hmtx'));
controls.push({name:'shared literal glyph pair',flags:3});
const other=Buffer.from(bundled.embeddedFonts.find(face=>face.family===bundled.embeddedFonts[0].family&&face.weight===700&&!face.italic).dataUrl.split(',')[1],'base64');
const mixedFixture=await collectionFixture([source,sameMetrics.data,other]);
const indexOf=(container,face,tag)=>container.faces[face].indices.find(index=>container.entries[index].tag===tag);
const replaceIndex=(container,face,tag,replacement)=>{const list=container.faces[face].indices;list[list.indexOf(indexOf(container,face,tag))]=replacement;};
const malformed=[
  ['cross-paired glyph locations',container=>replaceIndex(container,1,'loca',indexOf(container,2,'loca'))],
  ['only locations shared',container=>replaceIndex(container,2,'loca',indexOf(container,0,'loca'))],
  ['missing glyph table',container=>{container.faces[1].indices=container.faces[1].indices.filter(index=>container.entries[index].tag!=='glyf');}],
  ['missing location table',container=>{container.faces[1].indices=container.faces[1].indices.filter(index=>container.entries[index].tag!=='loca');}],
  ['duplicate face table',container=>container.faces[1].indices.push(container.faces[1].indices[0])],
  ['inconsistent shared metric count',container=>{
    const entry=container.entries[indexOf(container,1,'hhea')],bytes=Buffer.from(entry.bytes);bytes.writeUInt16BE(bytes.readUInt16BE(34)-1,34);
    const index=container.entries.length;container.entries.push({...entry,bytes});replaceIndex(container,1,'hhea',index);
  }],
];
for(const [name,edit]of malformed){
  const data=mixedFixture.transform(3,{edit});
  assert.throws(()=>createFontRegistry([{data,postscriptName:sameMetrics.postscriptName}],{fontShaper:shaper}),error=>{
    assert.equal(error.code,'invalid-font-container',name);failures.push({name,code:error.code,message:error.message});return true;
  },name);
}
const partial=sameFixture.transform(3,{edit:container=>{
  literalGlyphs(container,source);
  const entry=container.entries[indexOf(container,1,'loca')],index=container.entries.length;
  container.entries.push({...entry,bytes:Buffer.from(entry.bytes)});replaceIndex(container,1,'loca',index);
}});
assert.throws(()=>shaper.prepareFontData(partial),error=>{
  assert.equal(error.code,'invalid-font-container');failures.push({name:'partially shared literal pair',code:error.code,message:error.message});return true;
});
bundled.dispose();
await writeFile('artifacts/font-shaping/collections.json',JSON.stringify({node:process.version,inputDirectory:'collection-inputs',cases,controls,failures},null,2)+'\n');
console.log(`WOFF2 collections: ${cases.length} selected-face cases preserve shared glyphs, independent metrics, face order and original source runs; ${controls.length} shared-metric controls pass and ${failures.length} malformed collections reject.`);
