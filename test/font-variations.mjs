import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {create} from 'fontkit';
import * as hb from 'harfbuzzjs';
import {createFontRegistry} from '../dist/fonts.js';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {renderSvg} from '../dist/svg.js';
import {fontTables} from './font-container-fixtures.mjs';
import {fontFixtures,instanceCases,containersFor,sha256} from './font-variations-fixtures.mjs';
const shaper=await loadHarfBuzzShaper(),records=await fontFixtures(),report={node:process.version,cases:[],negativeControls:[]};
const normalizedReference=JSON.parse(await readFile(new URL('./fixtures/font-formats/normalization-reference.json',import.meta.url)));
const texts=['  office affine AVATAR  ','HHHH WWWW','o\u0302\u0301','Ágj'];
for(const record of records){
  const raw=create(record.data),blob=new hb.Blob(record.data.buffer.slice(record.data.byteOffset,record.data.byteOffset+record.data.byteLength)),face=new hb.Face(blob),refFont=new hb.Font(face);
  const cases=instanceCases(record);
  for(const [formatIndex,container]of (await containersFor(record)).entries()){
    const selected=formatIndex===0?cases:cases.filter(item=>['default','maximum','interior'].includes(item.id)||item===cases[1]);
    for(const item of selected){
      const coordinates=item.coordinates;
      const reference=Object.keys(coordinates).length?raw.getVariation(coordinates):raw;
      if(Object.keys(coordinates).length){
        const expected=normalizedReference.cases.find(row=>row.file===record.file&&row.id===item.id);
        assert.ok(expected,'Require independent normalized coordinates for each fixture instance');
        reference._variationProcessor.normalizedCoords=expected.normalized;
      }
      refFont.setVariations(Object.entries(coordinates).map(([tag,value])=>new hb.Variation(tag,value)));
      for(const backend of ['fontkit','harfbuzz']){
        const registry=createFontRegistry([{data:container.data,family:'Fixture',italic:record.italic,license:record.license,...(container.postscriptName?{postscriptName:container.postscriptName}:{}),...(item.variations!==undefined?{variations:item.variations}:{})}],backend==='harfbuzz'?{fontShaper:shaper}:{});
        const style={fontFamily:'Fixture',italic:record.italic},preparation=registry.fontPreparations[0],descriptor=registry.embeddedFonts[0];
        assert.deepEqual(preparation.variations,Object.keys(coordinates).length?coordinates:undefined);
        assert.deepEqual(descriptor.variations,preparation.variations);
        if(typeof item.variations==='string')assert.equal(preparation.namedInstance,item.variations);
        const observations=[];
        for(const text of texts){
          const measured=registry.textMeasurement.measure(text,32,style);
          if(backend==='fontkit'){
            const run=reference.layout(text);assert.equal(measured,run.advanceWidth*32/raw.unitsPerEm);
          }else{
            const buffer=new hb.Buffer();buffer.addText(text);buffer.setLanguage('und');buffer.guessSegmentProperties();hb.shape(refFont,buffer);
            const infos=buffer.getGlyphInfos(),positions=buffer.getGlyphPositions(),run=registry.shapeText(text,style);
            assert.equal(run.text,text);assert.equal(run.width,positions.reduce((n,p)=>n+p.xAdvance,0)/face.upem);
            assert.deepEqual(run.glyphs.map(({id,cluster,xAdvance,yAdvance,xOffset,yOffset})=>({id,cluster,xAdvance,yAdvance,xOffset,yOffset})),infos.map((info,index)=>({id:info.codepoint,cluster:info.cluster,...positions[index]})));
            for(const glyph of run.glyphs){assert.equal(glyph.sourceStart,glyph.cluster);assert.ok(glyph.sourceEnd>glyph.sourceStart&&glyph.sourceEnd<=text.length);}
          }
          observations.push({text,width:measured,outline:registry.textMeasurement.outlineBounds(text,32,style)});
        }
        const bytes=Buffer.from(descriptor.dataUrl.split(',')[1],'base64');
        if(!['collection','dfont'].includes(container.format)&&!preparation.embeddingReason)assert.deepEqual(bytes,container.data,'Retain original standalone font bytes');
        else {
          const expected=fontTables(record.data);if(preparation.removedSignature)expected.delete('DSIG');
          assert.deepEqual(fontTables(bytes),expected,'Retain selected font tables');
        }
        assert.equal(descriptor.license,record.license);
        const svg=renderSvg({slides:[{title:'Variable source'}]},{embeddedFonts:[descriptor]});
        if(Object.keys(coordinates).length){
          assert.match(svg,/font-variation-settings:/);assert.match(svg,/data-opf-font-sources="1"/);
          // Returned maps cannot reconfigure an existing registry or its cache.
          descriptor.variations.wght=-1;preparation.variations.wght=-1;
          assert.deepEqual(registry.fontPreparations[0].variations,coordinates);
        }
        report.cases.push({file:record.file,sourceSha256:sha256(record.data),format:container.format,containerSha256:sha256(container.data),id:item.id,backend,coordinates,observations});
        registry.dispose();registry.dispose();
      }
    }
  }
}
const variable=records.find(record=>Object.keys(record.axes).length),staticFont=records.find(record=>!Object.keys(record.axes).length);
const construct=variations=>createFontRegistry([{data:variable.data,family:'Fixture',variations}],{fontShaper:shaper});
for(const [name,variations]of [['unknown name','Missing instance'],['empty name',''],['unknown axis',{ABCD:1}],['below range',{wght:0}],['above range',{wght:1001}],['not finite',{wght:Infinity}],['not numeric',{wght:'400'}],['null',null],['array',[]],['bad tag',{'x";':400}]]){
  assert.throws(()=>construct(variations),{code:'invalid-font-variations'});report.negativeControls.push(name);
}
assert.throws(()=>createFontRegistry([{data:staticFont.data,variations:{wght:400}}]),{code:'invalid-font-variations'});report.negativeControls.push('static font axes');
assert.throws(()=>renderSvg({slides:[{title:'Invalid metadata'}]},{embeddedFonts:[{family:'Fixture',weight:400,dataUrl:`data:font/otf;base64,${staticFont.data.toString('base64')}`,variations:{wght:'bad'}}]}),{code:'invalid-embedded-font'});report.negativeControls.push('invalid SVG variation metadata');
await mkdir('artifacts/font-shaping',{recursive:true});await writeFile('artifacts/font-shaping/variations.json',JSON.stringify(report,null,2)+'\n');
console.log(`CFF/variable fonts: ${report.cases.length} format/instance/backend cases across ${records.length} pinned fonts; ${report.negativeControls.length} explicit rejection controls.`);
