import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';

const root=new URL('../test/fixtures/font-directions/',import.meta.url);
const sources=JSON.parse(await readFile(new URL('sources.json',root),'utf8'));
async function read(name){
  const bytes=gunzipSync(await readFile(new URL(name+'.gz',root)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),sources[name].sha256,name);
  return bytes.toString('utf8');
}
const common=await read('hb-common.cc');
const direction=common.slice(common.indexOf('hb_script_get_horizontal_direction (hb_script_t script)'));
const rtl=new Set([...direction.slice(0,direction.indexOf('return HB_DIRECTION_RTL;')).matchAll(/case HB_SCRIPT_([A-Z_]+):/g)].map(match=>match[1]));
assert.equal(rtl.size,36);
const aliases=(await read('PropertyValueAliases.txt')).split('\n').map(line=>line.split('#')[0].split(';').map(value=>value.trim())).filter(parts=>parts[0]==='sc');
const tags=aliases.filter(parts=>rtl.has(parts[2].toUpperCase())).map(parts=>parts[1]).sort();
assert.equal(tags.length,rtl.size);
const ranges=(await read('Scripts.txt')).split('\n').flatMap(line=>{
  const match=/^([A-F0-9]+)(?:\.\.([A-F0-9]+))?\s*;\s*([A-Za-z_]+)/.exec(line);
  if(!match||['Common','Inherited','Unknown'].includes(match[3]))return [];
  return [[parseInt(match[1],16),parseInt(match[2]??match[1],16),rtl.has(match[3].toUpperCase())?1:0]];
}).sort((a,b)=>a[0]-b[0]);
const compact=[];
for(const range of ranges){
  const prior=compact.at(-1);assert.ok(!prior||range[0]>prior[1]);
  if(prior&&range[0]===prior[1]+1&&range[2]===prior[2])prior[1]=range[1];else compact.push(range);
}
const output=`// Generated from Unicode 17 Scripts and HarfBuzz 14.4.0 direction rules.\n// Regenerate with scripts/generate-font-directions.mjs. See fixtures/font-directions\n// for hash-bound upstream data; Unicode and HarfBuzz notices ship in dist.\nexport const rtlScriptTags = ${JSON.stringify(tags)};\nexport const scriptDirectionRanges = [\n${compact.map(range=>'  '+JSON.stringify(range)).join(',\n')}\n];\n`;
const target=new URL('../src/font-direction-data.js',import.meta.url);
if(process.argv.includes('--check'))assert.equal(await readFile(target,'utf8'),output);else await writeFile(target,output);
console.log(`Unicode/HarfBuzz direction table: ${compact.length} ranges and ${tags.length} RTL script tags.`);
