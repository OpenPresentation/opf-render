import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {brotliCompressSync,deflateSync} from 'node:zlib';
import {create} from 'fontkit';
import wawoff2 from 'wawoff2';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {createFontRegistry} from '../dist/fonts.js';
import {loadOfficeFontRegistry} from '../dist/fonts-node.js';
import {makeCollection,makeWoff,fontTables} from './font-container-fixtures.mjs';

const bundled=await loadOfficeFontRegistry(), service=await loadHarfBuzzShaper();
const records=bundled.embeddedFonts;
assert.equal(records.length,33);
const text='office AVATAR abc',style={fontFamily:'Fixture'};
const report={node:process.version,faces:[],collections:[],negativeControls:[]};
const fromDescriptor=face=>Buffer.from(face.dataUrl.split(',')[1],'base64');
const hash=data=>createHash('sha256').update(data).digest('hex');
const registry=(data,options={},extra={})=>createFontRegistry([{data,family:'Fixture',...extra}],{fontShaper:service,...options});
for(const record of records) {
  const style={fontFamily:'Fixture',fontWeight:record.weight,italic:record.italic};
  const selection={weight:record.weight,italic:record.italic};
  const data=fromDescriptor(record), single=registry(data,{},selection);
  const sample=text+(create(data).hasGlyphForCodePoint(0x301)?' e\u0301':'');
  const run=single.shapeText(sample,style);
  const woff=makeWoff(data,true),woff2=Buffer.from(await wawoff2.compress(data));
  for(const [format,compressed] of [['woff',woff],['woff2',woff2]]) {
    const owned=Buffer.from(compressed), prepared=registry(owned,{}, {...selection,license:'Fixture license annotation'});
    owned.fill(0);
    assert.deepEqual(prepared.shapeText(sample,style),run,`${record.family}/${record.weight}/${format}`);
    assert.deepEqual(fromDescriptor(prepared.embeddedFonts[0]),compressed,'Preserve complete original standalone font including metadata');
    assert.equal(prepared.embeddedFonts[0].license,'Fixture license annotation');
    assert.equal(prepared.fontPreparations[0].measurementFormat,'ttf');
    assert.equal(prepared.fontPreparations[0].sourceFormat,format);
    prepared.fontPreparations[0].sourceFormat='mutated';
    assert.equal(prepared.fontPreparations[0].sourceFormat,format,'Descriptors are snapshots');
    const raw=Buffer.from(service.prepareFontData(compressed).data);
    const originalTables=fontTables(data), actualTables=fontTables(raw);
    for(const [tag,bytes]of originalTables) {
      // WOFF2 may reconstruct glyf/loca/hmtx and set head flag bit 11.
      if(tag==='DSIG'||format==='woff2'&&['glyf','loca','hmtx','head'].includes(tag))continue;
      assert.deepEqual(actualTables.get(tag),bytes,`${format} retains ${tag}`);
    }
    let sum=0;for(let i=0;i<raw.length;i+=4)sum=(sum+raw.readUInt32BE(i))>>>0;
    assert.equal(sum,0xb1b0afba,'Reconstructed standalone checksum');
    report.faces.push({family:record.family,weight:record.weight,italic:record.italic,format,text:sample,sourceSha256:hash(compressed),preparedSha256:hash(raw),glyphs:run.glyphs.length});
    prepared.dispose();
  }
  single.dispose();
}
const sources=records.filter(face=>face.family==='Roboto'&&!face.italic&&[400,700].includes(face.weight)).map(fromDescriptor);
const collection=makeCollection(sources),compressedCollection=Buffer.from(await wawoff2.compress(collection));
assert.throws(()=>registry(collection),{code:'font-collection'});
assert.throws(()=>registry(compressedCollection),{code:'font-collection'});
const widths=[];
for(const data of sources) {
  const postscriptName=create(data).postscriptName,single=registry(data);
  for(const [format,container]of [['collection',collection],['woff2',compressedCollection]]) {
    const selected=registry(container,{}, {postscriptName});
    assert.deepEqual(selected.shapeText(text,style),single.shapeText(text,style));
    const embedded=fromDescriptor(selected.embeddedFonts[0]);
    assert.equal(create(embedded).postscriptName,postscriptName,'Embedded bytes select the same physical face');
    for(const [tag,bytes]of fontTables(data))if(tag!=='DSIG'&&(format==='collection'||!['glyf','loca','hmtx','head'].includes(tag)))
      assert.deepEqual(fontTables(embedded).get(tag),bytes,`Selected collection preserves ${tag}`);
    assert.equal(selected.fontPreparations[0].selectedCollectionFace,true);
    report.collections.push({format,postscriptName,embeddedSha256:hash(embedded)});
    selected.dispose();
  }
  const legacy=createFontRegistry([{data:collection,family:'Fixture',postscriptName}]);
  assert.equal(create(fromDescriptor(legacy.embeddedFonts[0])).postscriptName,postscriptName,'Default backend also embeds selected face');
  widths.push(single.textMeasurement.measure(text,32,style));single.dispose();legacy.dispose();
}
assert.notEqual(widths[0],widths[1]);
const signedCollection=registry(makeCollection(sources,true),{}, {postscriptName:create(sources[1]).postscriptName});
assert.equal(signedCollection.fontPreparations[0].removedSignature,true,'Extraction reports the invalidated collection signature');
assert.deepEqual(fontTables(fromDescriptor(signedCollection.embeddedFonts[0])),fontTables(sources[1]));
signedCollection.dispose();report.signatureRemoval='Synthetic version-2 collection DSIG is removed and reported; no signature authenticity claim.';
const woff=makeWoff(sources[0]),woff2=Buffer.from(await wawoff2.compress(sources[0]));
function rejects(name,action,code) { assert.throws(action,code?{code}:undefined);report.negativeControls.push(name); }
rejects('decoded WOFF limit',()=>registry(woff,{maxPreparedFontBytes:woff.length+1}),'font-size-limit');
rejects('decoded WOFF2 limit',()=>registry(woff2,{maxPreparedFontBytes:woff2.length+1}),'font-size-limit');
rejects('collection extraction limit',()=>registry(collection,{maxPreparedFontBytes:100},{postscriptName:create(sources[1]).postscriptName}),'font-size-limit');
rejects('invalid byte limit',()=>registry(woff,{maxPreparedFontBytes:NaN}),'invalid-font-byte-limit');
for(const [name,source,offset,value]of [['WOFF reserved',woff,14,1],['WOFF length',woff,8,0],['WOFF checksum',woff,60,0],['WOFF2 length',woff2,8,0],['WOFF2 reserved',woff2,14,1]]) {
  const invalid=Buffer.from(source);offset===14?invalid.writeUInt16BE(value,offset):invalid.writeUInt32BE(value,offset);
  rejects(name,()=>registry(invalid),'invalid-font-container');
}
const truncated=woff2.subarray(0,woff2.length-10);rejects('truncated WOFF2',()=>registry(truncated),'invalid-font-container');
for(const value of [woff,woff2])rejects('truncated header',()=>registry(value.subarray(0,8)),'invalid-font-container');
// Plausible small table declarations carrying much larger compressed streams.
// Reject during bounded decompression, before parsing or allocating font tables.
const expansion=Buffer.alloc(1024*1024),brotli=brotliCompressSync(expansion),zlib=deflateSync(expansion);
const bomb2=Buffer.alloc(54+brotli.length);bomb2.write('wOF2');bomb2.writeUInt32BE(0x10000,4);bomb2.writeUInt32BE(bomb2.length,8);
bomb2.writeUInt16BE(1,12);bomb2.writeUInt32BE(32,16);bomb2.writeUInt32BE(brotli.length,20);bomb2[48]=63;bomb2.write('TEST',49);bomb2[53]=4;brotli.copy(bomb2,54);
rejects('Brotli expands beyond declared table bytes',()=>registry(bomb2),'invalid-font-container');
const bomb=Buffer.alloc(64+zlib.length);bomb.write('wOFF');bomb.writeUInt32BE(0x10000,4);bomb.writeUInt32BE(bomb.length,8);bomb.writeUInt16BE(1,12);
bomb.writeUInt32BE(12+16+4096,16);bomb.write('TEST',44);bomb.writeUInt32BE(64,48);bomb.writeUInt32BE(zlib.length,52);bomb.writeUInt32BE(4096,56);zlib.copy(bomb,64);
rejects('zlib expands beyond declared table bytes',()=>registry(bomb),'font-size-limit');
bundled.dispose();
await mkdir('artifacts/font-shaping',{recursive:true});await writeFile('artifacts/font-shaping/formats.json',JSON.stringify(report,null,2)+'\n');
console.log(`Font containers: ${report.faces.length} compressed faces, ${report.collections.length} selected collections, ${report.negativeControls.length} explicit failure controls.`);
