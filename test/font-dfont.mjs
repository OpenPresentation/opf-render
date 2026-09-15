import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {create} from 'fontkit';
import {createFontRegistry} from '../dist/fonts.js';
import {loadOfficeFontRegistry} from '../dist/fonts-node.js';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {renderSvg} from '../dist/svg.js';
import {makeDfont} from './font-dfont-fixtures.mjs';
import {fontTables} from './font-container-fixtures.mjs';
const shaper=await loadHarfBuzzShaper(),bundled=await loadOfficeFontRegistry();
const records=bundled.embeddedFonts,sources=records.map(face=>Buffer.from(face.dataUrl.split(',')[1],'base64'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={node:process.version,faces:[],controls:[],negativeControls:[]},output='artifacts/font-shaping/dfont';
await mkdir(output,{recursive:true});
const license='Keep "author" & <license>\nverbatim',style={fontFamily:'Fixture',fontWeight:400};
for(const [index,source]of sources.entries()){
  const other=sources[(index+1)%sources.length],postscriptName=create(source).postscriptName;
  const style={fontFamily:'Fixture',fontWeight:400,italic:records[index].italic};
  const data=makeDfont([other,source],{dataOffset:index%2?512:256,mapFirst:index%2===1});
  assert.deepEqual(create(data).fonts.map(font=>font.postscriptName),[create(other).postscriptName,postscriptName],'Independent Fontkit parser accepts fixture order');
  await writeFile(`${output}/${index}.dfont`,data);await writeFile(`${output}/${index}.ttf`,source);
  for(const backend of ['fontkit','harfbuzz']){
    const options=backend==='harfbuzz'?{fontShaper:shaper}:{};
    const reference=createFontRegistry([{data:source,family:'Fixture',italic:style.italic}],options);
    const input=Buffer.from(data),registry=createFontRegistry([{data:input,family:'Fixture',postscriptName,license,italic:style.italic}],options);
    input.fill(0);
    for(const text of ['office AVATAR  123','o\u0302\u0301','  Keep spaces  ','Ágj']){
      let expected;try{expected=reference.textMeasurement.measure(text,32,style);}catch(error){
        assert.equal(error.code,'missing-glyph');assert.throws(()=>registry.textMeasurement.measure(text,32,style),{code:'missing-glyph'});continue;
      }
      assert.equal(registry.textMeasurement.measure(text,32,style),expected);
      assert.deepEqual(registry.textMeasurement.outlineBounds(text,32,style),reference.textMeasurement.outlineBounds(text,32,style));
      if(backend==='harfbuzz')assert.deepEqual(registry.shapeText(text,style),reference.shapeText(text,style));
    }
    const descriptor=registry.embeddedFonts[0],embedded=Buffer.from(descriptor.dataUrl.split(',')[1],'base64');
    assert.equal(create(embedded).postscriptName,postscriptName);
    assert.deepEqual(fontTables(embedded),fontTables(source),'Every selected table survives extraction');
    assert.equal(descriptor.sourceDataUrl,`data:font/dfont;base64,${data.toString('base64')}`);
    assert.equal(descriptor.license,license);
    assert.deepEqual(registry.fontPreparations[0],{family:'Fixture',postscriptName,sourceFormat:'dfont',measurementFormat:'ttf',embeddedFormat:'ttf',selectedCollectionFace:true,removedSignature:false,embeddingReason:'dfont-resource',selectedResourceId:129,selectedResourceIndex:1});
    const svg=renderSvg({slides:[{title:'Resource source'}]},{embeddedFonts:registry.embeddedFonts});
    assert.ok(svg.includes('data-opf-font-sources="1"'));assert.ok(svg.includes(descriptor.sourceDataUrl));
    report.faces.push({index,backend,postscriptName,sourceSha256:hash(source),containerSha256:hash(data),embeddedSha256:hash(embedded)});
    registry.dispose();registry.dispose();reference.dispose();
  }
}
const data=makeDfont(sources.slice(0,2)),postscriptName=create(sources[1]).postscriptName;
const registry=(bytes,options={},name=postscriptName)=>createFontRegistry([{data:bytes,family:'Fixture',postscriptName:name}],{fontShaper:shaper,...options});
for(const [name,container]of [['single sfnt',makeDfont([sources[1]])],['first sfnt',makeDfont([sources[1],sources[0]])]]){
  const selected=registry(container),embedded=Buffer.from(selected.embeddedFonts[0].dataUrl.split(',')[1],'base64');
  assert.deepEqual(fontTables(embedded),fontTables(sources[1]));
  assert.equal(selected.fontPreparations[0].selectedResourceId,128);
  selected.dispose();report.controls.push(name);
}
function rejects(name,action,code='invalid-font-container'){assert.throws(action,{code});report.negativeControls.push(name);}
rejects('selection required',()=>createFontRegistry([{data}],{fontShaper:shaper}),'font-collection');
rejects('unknown selection',()=>registry(data,{},'missing'),'font-collection');
rejects('duplicate PostScript names',()=>registry(makeDfont([sources[1],sources[1]])),'font-collection');
rejects('source byte limit',()=>registry(data,{maxPreparedFontBytes:data.length-1}),'font-size-limit');
rejects('default backend source limit',()=>createFontRegistry([{data,postscriptName}],{maxPreparedFontBytes:data.length-1}),'font-size-limit');
const map=data.readUInt32BE(4),type=map+data.readUInt16BE(map+24),sfnt=type+10,ref=type+data.readUInt16BE(sfnt+6);
for(const [name,change]of [
  ['map outside file',b=>b.writeUInt32BE(b.length,4)],
  ['data overlaps map',b=>b.writeUInt32BE(map,0)],
  ['truncated map header',b=>b.writeUInt32BE(27,12)],
  ['type list outside map',b=>b.writeUInt16BE(65535,map+24)],
  ['oversized type count',b=>b.writeUInt16BE(65534,type)],
  ['duplicate resource type',b=>b.write('NOTE',sfnt)],
  ['reference list overlaps type records',b=>b.writeUInt16BE(2,sfnt+6)],
  ['reference list exceeds map',b=>b.writeUInt16BE(65535,sfnt+6)],
  ['duplicate resource ID',b=>b.writeInt16BE(b.readInt16BE(ref),ref+12)],
  ['name exceeds map',b=>b.writeUInt16BE(30000,ref+2)],
  ['data exceeds declared area',b=>b.writeUIntBE(0xffffff,ref+5,3)],
  ['payload exceeds resource data',b=>b.writeUInt32BE(0xffffffff,b.readUInt32BE(0)+b.readUIntBE(ref+5,3))],
  ['sfnt signature is not a face',b=>b.write('ttcf',b.readUInt32BE(0)+b.readUIntBE(ref+5,3)+4)],
]){const invalid=Buffer.from(data);change(invalid);rejects(name,()=>registry(invalid));}
rejects('truncated source',()=>registry(data.subarray(0,20)));
bundled.dispose();
await writeFile('artifacts/font-shaping/dfont.json',JSON.stringify(report,null,2)+'\n');
console.log(`DFont resources: ${report.faces.length} selected-face/backend cases preserve tables, source runs, complete containers and licenses; ${report.negativeControls.length} invalid/selection controls reject.`);
