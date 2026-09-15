import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import wawoff2 from 'wawoff2';
import {loadOfficeFontRegistry} from '../dist/fonts-node.js';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {createFontRegistry} from '../dist/fonts.js';
import {renderSvg} from '../dist/svg.js';
import {fontTables} from './font-container-fixtures.mjs';
import {makeWoff2Hmtx} from './font-woff2-hmtx-fixtures.mjs';

const bundled=await loadOfficeFontRegistry(),service=await loadHarfBuzzShaper(),cases=[],failures=[];
const directory='artifacts/font-shaping/hmtx-inputs';await mkdir(directory,{recursive:true});
let faceIndex=0;
for(const face of bundled.embeddedFonts) {
  const font=Buffer.from(face.dataUrl.split(',')[1],'base64'),entry={family:'Fixture',weight:face.weight,italic:face.italic};
  const style={fontFamily:'Fixture',fontWeight:face.weight,italic:face.italic},text='office AVATAR 123';
  const reference=createFontRegistry([{...entry,data:font}],{fontShaper:service});
  const sourceFile=`${faceIndex}.ttf`;await writeFile(`${directory}/${sourceFile}`,font);
  for(const flags of [1,2,3]) {
    const fixture=makeWoff2Hmtx(font,flags);
    let googleResult;
    try {googleResult=Buffer.from(await wawoff2.decompress(fixture.data));}catch{googleResult=null;}
    const expected=fontTables(font).get('hmtx');
    if(googleResult)assert.deepEqual(fontTables(googleResult).get('hmtx'),expected);
    const prepared=Buffer.from(service.prepareFontData(fixture.data).data),actual=fontTables(prepared).get('hmtx');
    assert.equal(actual.length,expected.length,`${face.family}/${face.weight}/${flags}: reconstructed hmtx length`);
    assert.deepEqual(actual,expected,`${face.family}/${face.weight}/${flags}: every advance and bearing`);
    const selected=createFontRegistry([{...entry,data:fixture.data}],{fontShaper:service});
    assert.deepEqual(selected.shapeText(text,style),reference.shapeText(text,style));
    assert.deepEqual(Buffer.from(selected.embeddedFonts[0].sourceDataUrl.split(',')[1],'base64'),fixture.data,'Preserve original WOFF2 bytes separately from the browser-compatible face');
    assert.deepEqual(fontTables(Buffer.from(selected.embeddedFonts[0].dataUrl.split(',')[1],'base64')).get('hmtx'),expected);
    assert.equal(selected.fontPreparations[0].embeddingReason,'woff2-hmtx-compatibility');
    const svg=renderSvg({slides:[{title:'Font-source metadata'}]},{embeddedFonts:selected.embeddedFonts});
    assert.ok(svg.includes('data-opf-font-sources="1"'));
    assert.ok(svg.includes(selected.embeddedFonts[0].sourceDataUrl),'Export retains the entire original WOFF2 wrapper');
    const file=`${faceIndex}-${flags}.woff2`;await writeFile(`${directory}/${file}`,fixture.data);
    cases.push({family:face.family,weight:face.weight,italic:face.italic,flags,numGlyphs:fixture.numGlyphs,numHMetrics:fixture.numHMetrics,googleAccepted:!!googleResult,file,sourceFile,sha256:createHash('sha256').update(fixture.data).digest('hex'),sourceSha256:createHash('sha256').update(font).digest('hex')});
    selected.dispose();
  }
  reference.dispose();faceIndex++;
}
const font=Buffer.from(bundled.embeddedFonts[0].dataUrl.split(',')[1],'base64');
const editLocation=(tables,index,value)=>{
  const long=tables.get('head').readInt16BE(50)===1;
  tables.get('loca')[long?'writeUInt32BE':'writeUInt16BE'](value,index*(long?4:2));
};
const invalid=[
  ['no omitted bearings',0,{}],['reserved metric flag',4,{}],
  ['missing glyph table',3,{editTables:tables=>tables.delete('glyf')}],
  ['missing location table',3,{editTables:tables=>tables.delete('loca')}],
  ...[['head',53],['maxp',5],['hhea',35],['loca',2]].map(([tag,length])=>[
    `truncated ${tag}`,3,{editTables:tables=>tables.set(tag,tables.get(tag).subarray(0,length))},
  ]),
  ['invalid location format',3,{editTables:tables=>tables.get('head').writeInt16BE(2,50)}],
  ['zero metric count',3,{editTables:tables=>tables.get('hhea').writeUInt16BE(0,34)}],
  ['metric count exceeds glyphs',3,{editTables:tables=>tables.get('hhea').writeUInt16BE(tables.get('maxp').readUInt16BE(4)+1,34)}],
  ['descending glyph locations',3,{editTables:tables=>{editLocation(tables,0,4);editLocation(tables,1,0);}}],
  ['glyph beyond table',3,{editTables:tables=>editLocation(tables,tables.get('maxp').readUInt16BE(4),0xffff)}],
  ['short glyph header',3,{editTables:tables=>{editLocation(tables,0,0);editLocation(tables,1,1);}}],
  ['truncated metric stream',3,{editMetrics:bytes=>bytes.subarray(0,bytes.length-1)}],
  ['trailing metric stream',3,{editMetrics:bytes=>Buffer.concat([bytes,Buffer.from([0])])}],
  ['incorrect original metric length',3,{editTables:tables=>tables.set('hmtx',tables.get('hmtx').subarray(1))}],
];
for(const [name,flags,options]of invalid) {
  const fixture=makeWoff2Hmtx(font,flags,options);
  assert.throws(()=>createFontRegistry([{family:'Invalid',data:fixture.data}],{fontShaper:service}),error=>{
    assert.equal(error.code,'invalid-font-container',name);failures.push({name,code:error.code,message:error.message});return true;
  },name);
}
for(const sourceDataUrl of ['https://example.invalid/font.woff2','data:text/html;base64,PHNjcmlwdD4='])
  assert.throws(()=>renderSvg({slides:[{title:'Invalid font metadata'}]},{embeddedFonts:[{...bundled.embeddedFonts[0],sourceDataUrl}]}),{code:'invalid-embedded-font'});
bundled.dispose();
await mkdir('artifacts/font-shaping',{recursive:true});await writeFile('artifacts/font-shaping/hmtx.json',JSON.stringify({node:process.version,inputDirectory:'hmtx-inputs',cases,failures},null,2)+'\n');
console.log(`WOFF2 hmtx: ${cases.length} literal-glyph/transformed-metric cases preserve every advance, bearing and source glyph run; ${failures.length} malformed inputs reject.`);
