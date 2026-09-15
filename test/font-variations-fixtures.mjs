import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import wawoff2 from 'wawoff2';
import {makeWoff,makeCollection} from './font-container-fixtures.mjs';
import {makeDfont} from './font-dfont-fixtures.mjs';
export const fixtureRoot=new URL('./fixtures/font-formats/',import.meta.url);
export const sha256=data=>createHash('sha256').update(data).digest('hex');
export async function fontFixtures(){
  const manifest=JSON.parse(await readFile(new URL('manifest.json',fixtureRoot))),reference=JSON.parse(await readFile(new URL('reference.json',fixtureRoot)));
  for(const item of [...manifest.fonts,...manifest.licenses]){
    const bytes=await readFile(new URL(item.file,fixtureRoot));
    if(sha256(bytes)!==item.sha256)throw new Error(`Font fixture hash mismatch: ${item.file}`);
  }
  return Promise.all(reference.fonts.map(async record=>({...record,data:await readFile(new URL(record.file,fixtureRoot)),license:await readFile(new URL(record.file.split('/')[0]+'/LICENSE.md',fixtureRoot),'utf8')})));
}
export function instanceCases(record){
  const axes=Object.entries(record.axes),defaults=Object.fromEntries(axes.map(([tag,axis])=>[tag,axis.default]));
  const cases=[{id:'default',coordinates:defaults}];
  for(const instance of record.instances)cases.push({id:`named:${instance.name}`,variations:instance.name,coordinates:instance.coordinates});
  if(axes.length){
    for(const [id,fraction]of [['minimum',0],['maximum',1],['interior',.37]])cases.push({id,coordinates:Object.fromEntries(axes.map(([tag,axis])=>[tag,axis.min+(axis.max-axis.min)*fraction]))});
    for(const item of cases)if(item.id!=='default'&&item.variations===undefined)item.variations=item.coordinates;
    const first=axes[0],partial={[first[0]]:first[1].max};
    cases.push({id:'partial',variations:partial,coordinates:{...defaults,...partial}});
  }
  return cases;
}
export async function containersFor(record){
  return [
    {format:record.file.endsWith('.otf')?'otf':'ttf',data:record.data},
    {format:'woff',data:makeWoff(record.data,true)},
    {format:'woff2',data:Buffer.from(await wawoff2.compress(record.data))},
    {format:'collection',data:makeCollection([record.data]),postscriptName:record.postscriptName},
    {format:'dfont',data:makeDfont([record.data]),postscriptName:record.postscriptName},
  ];
}
