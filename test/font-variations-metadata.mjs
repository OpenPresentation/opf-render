import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createFontRegistry} from '../dist/fonts.js';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {buildSfnt} from '../dist/font-sfnt.js';
import {fontTables} from './font-container-fixtures.mjs';
import {fontFixtures} from './font-variations-fixtures.mjs';
const records=(await fontFixtures()).filter(record=>Object.keys(record.axes).length),shaper=await loadHarfBuzzShaper();
const report={node:process.version,positive:[],negative:[]};
// Changed fvar controls exist only in memory; original licensed binaries stay intact.
function change(record,edit){
 const tables=fontTables(record.data),fvar=Buffer.from(tables.get('fvar'));
 tables.set('fvar',edit(fvar)??fvar);
 return buildSfnt([...tables].map(([tag,data])=>({tag:Buffer.from(tag).readUInt32BE(),data})),record.data.readUInt32BE()).data;
}
function padRecords(fvar,{offset=32,axisPadding=4,instancePadding=4,omitPostscript=false}={}){
 const oldOffset=fvar.readUInt16BE(4),count=fvar.readUInt16BE(8),oldAxisSize=fvar.readUInt16BE(10),instances=fvar.readUInt16BE(12),oldInstanceSize=fvar.readUInt16BE(14);
 const axisSize=oldAxisSize+axisPadding,baseSize=4+count*4,instanceSize=(omitPostscript?baseSize:baseSize+2)+instancePadding;
 const result=Buffer.alloc(offset+count*axisSize+instances*instanceSize);
 fvar.copy(result,0,0,16);result.writeUInt16BE(axisPadding||instancePadding?1:0,2);result.writeUInt16BE(offset,4);result.writeUInt16BE(axisSize,10);result.writeUInt16BE(instanceSize,14);
 for(let i=0;i<count;i++)fvar.copy(result,offset+i*axisSize,oldOffset+i*oldAxisSize,oldOffset+i*oldAxisSize+20);
 for(let i=0;i<instances;i++){
  const target=offset+count*axisSize+i*instanceSize,start=oldOffset+count*oldAxisSize+i*oldInstanceSize;
  fvar.copy(result,target,start,start+baseSize);
  if(!omitPostscript)result.writeUInt16BE(oldInstanceSize>=baseSize+2?fvar.readUInt16BE(start+baseSize):0xffff,target+baseSize);
 }
 return result;
}
for(const record of records)for(const options of [{},{offset:24,axisPadding:0,instancePadding:0},{offset:24,axisPadding:0,instancePadding:0,omitPostscript:true}]){
 const data=change(record,fvar=>padRecords(fvar,options));
 for(const backend of ['fontkit','harfbuzz'])for(const instance of [record.instances[0],record.instances.at(-1)]){
  if(backend==='harfbuzz'&&options.axisPadding===undefined){
   // The reader handles future-compatible strides, while pinned HarfBuzz rejects
   // this hypothetical extended header. Keep that backend limit explicit.
   assert.throws(()=>createFontRegistry([{data,variations:instance.name}],{fontShaper:shaper}),{code:'invalid-font-variations'});
   report.negative.push({file:record.file,backend,control:'unsupported extended fvar in pinned HarfBuzz'});continue;
  }
  const registry=createFontRegistry([{data,family:'Fixture',italic:record.italic,variations:instance.name}],backend==='harfbuzz'?{fontShaper:shaper}:{});
  assert.deepEqual(registry.fontPreparations[0].variations,instance.coordinates);
  assert.equal(registry.fontPreparations[0].namedInstance,instance.name);
  const original=createFontRegistry([{data:record.data,family:'Fixture',italic:record.italic,variations:instance.coordinates}],backend==='harfbuzz'?{fontShaper:shaper}:{});
  assert.equal(registry.textMeasurement.measure('AVATAR office',32,{fontFamily:'Fixture',italic:record.italic}),original.textMeasurement.measure('AVATAR office',32,{fontFamily:'Fixture',italic:record.italic}));
  assert.deepEqual(Buffer.from(registry.embeddedFonts[0].dataUrl.split(',')[1],'base64'),Buffer.from(data));
  registry.dispose();original.dispose();report.positive.push({file:record.file,backend,instance:instance.name,control:options.omitPostscript?'relocated without PostScript fields':options.axisPadding===0?'relocated with PostScript fields':'extended record strides'});
 }
}
for(const record of records){
 const instance=record.instances.find(i=>i.postscriptName&&i.postscriptName!==record.postscriptName);
 if(!instance)continue;
 const registry=createFontRegistry([{data:record.data,postscriptName:instance.postscriptName}]);
 assert.deepEqual(registry.fontPreparations[0].variations,instance.coordinates);registry.dispose();
 report.positive.push({file:record.file,control:'named PostScript selection',instance:instance.name});
 assert.throws(()=>createFontRegistry([{data:record.data,postscriptName:instance.postscriptName,variations:instance.coordinates}]),{code:'invalid-font-variations'});
 report.negative.push({file:record.file,control:'conflicting instance selectors'});
}
const record=records.find(r=>Object.keys(r.axes).length===2);
const invalid=[
 ['truncated header',f=>f.subarray(0,15)],
 ['unsupported major',f=>{f.writeUInt16BE(2,0);}],
 ['invalid reserved header',f=>{f.writeUInt16BE(0,6);}],
 ['axes overlap header',f=>{f.writeUInt16BE(8,4);}],
 ['axes beyond table',f=>{f.writeUInt16BE(f.length,4);}],
 ['short axis record',f=>{f.writeUInt16BE(19,10);}],
 ['short instance record',f=>{f.writeUInt16BE(4,14);}],
 ['excess instance count',f=>{f.writeUInt16BE(65535,12);}],
 ['duplicate axis tag',f=>{const o=f.readUInt16BE(4);f.copy(f,o+f.readUInt16BE(10),o,o+4);}],
 ['non-ASCII axis tag',f=>{f[f.readUInt16BE(4)]=0;}],
 ['unordered range',f=>{const o=f.readUInt16BE(4);f.writeInt32BE(f.readInt32BE(o+12)+65536,o+4);}],
 ['instance outside axis',f=>{const o=f.readUInt16BE(4),i=o+f.readUInt16BE(8)*f.readUInt16BE(10);f.writeInt32BE(f.readInt32BE(o+12)+65536,i+4);}],
];
for(const [control,edit]of invalid)for(const backend of ['fontkit','harfbuzz']){
 const data=change(record,edit);
 assert.throws(()=>createFontRegistry([{data}],backend==='harfbuzz'?{fontShaper:shaper}:{}),{code:'invalid-font-variations'});report.negative.push({backend,control});
}
for(const variations of [new Map(),new Set(),new Date(0),/x/,new Uint8Array(),Object(42)]){
 assert.throws(()=>createFontRegistry([{data:record.data,variations}]),{code:'invalid-font-variations'});report.negative.push({control:Object.prototype.toString.call(variations)});
}
const noAxes=change(record,f=>{f.writeUInt16BE(0,8);f.writeUInt16BE(0,12);});
assert.throws(()=>createFontRegistry([{data:noAxes,postscriptName:'Missing physical font'}]),{code:'font-collection'});report.negative.push({control:'zero-axis PostScript mismatch'});
for(const variations of [{wght:Infinity},{XXXX:1},{wght:10000}]){
 assert.throws(()=>shaper.createFace({data:record.data,unitsPerEm:record.unitsPerEm,variations}),{code:'invalid-font-variations'});report.negative.push({control:'direct shaper rejects invalid variations'});
}
await mkdir('artifacts/font-shaping',{recursive:true});await writeFile('artifacts/font-shaping/variations-metadata.json',JSON.stringify(report,null,2)+'\n');
console.log(`Variable metadata: ${report.positive.length} offset/stride/name controls; ${report.negative.length} malformed/selection controls.`);
