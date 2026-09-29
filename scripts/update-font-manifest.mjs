// Explicit maintenance command: review any changed bytes and licenses before committing.
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {BUNDLED_FONT_MANIFEST} from '../src/font-manifest.js';
const require=createRequire(import.meta.url),hash=data=>createHash('sha256').update(data).digest('hex');
// Owner rule (FF-31): a pack's SPDX id is read from the notice the package actually ships, never
// assumed. Only permissive font licenses may be bundled: OFL-1.1, Apache-2.0, MIT and UFL-1.0.
function detectSpdx(text){
  if(/SIL Open Font License,? Version 1\.1/i.test(text)) return 'OFL-1.1';
  if(/Apache License\s+Version 2\.0/i.test(text)) return 'Apache-2.0';
  if(/Ubuntu Font Licen[sc]e,? Version 1\.0/i.test(text)) return 'UFL-1.0';
  if(/Permission is hereby granted, free of charge, to any person obtaining a copy/i.test(text)) return 'MIT';
  return undefined;
}
// Reserved Font Names declared in the copyright preamble before the license text ("with Reserved Font
// Name 'Source'", or PT Serif's list). An empty list means the notice declares none.
function reservedFontNames(text){
  const header=text.split(/^-{20,}/m)[0],found=[];
  for(const match of header.matchAll(/Reserved\s+Font\s+Names?\s+((?:["'“‘][^"'”’]+["'”’](?:\s*(?:,|and)\s*)*)+)/gi))
    for(const name of match[1].matchAll(/["'“‘]([^"'”’]+)["'”’]/g)) found.push(name[1].trim());
  return [...new Set(found)];
}
const ALLOWED_SPDX=['OFL-1.1','Apache-2.0','MIT','UFL-1.0'];
const root=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const manifest=structuredClone(BUNDLED_FONT_MANIFEST);
for(const [index,pkg] of manifest.packages.entries()){
  const directory=path.dirname(require.resolve(`${pkg.name}/package.json`));
  const installed=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));
  // Base and office packs are runtime dependencies. The script pack (FF-19) is an
  // optional peer that development pins exactly as a devDependency.
  const pinned=pkg.pack==='scripts'?root.devDependencies?.[pkg.name]:root.dependencies[pkg.name];
  assert.equal(pinned,installed.version,`Pin ${pkg.name} exactly before reviewing an updated font manifest.`);
  if(pkg.pack==='scripts'){
    assert.equal(root.peerDependencies?.[pkg.name],installed.version,`Declare ${pkg.name} as an exact optional peer.`);
    assert.equal(root.peerDependenciesMeta?.[pkg.name]?.optional,true,`Declare ${pkg.name} as an optional peer.`);
  }
  const notice=await readFile(path.join(directory,pkg.licenseFile),'utf8'),spdx=detectSpdx(notice);
  assert.ok(ALLOWED_SPDX.includes(spdx),`${pkg.name} ships ${pkg.licenseFile} without a permissive font license (OFL-1.1, Apache-2.0, MIT, UFL-1.0); do not bundle it.`);
  assert.equal(pkg.license,spdx,`${pkg.name}: the manifest license must equal the SPDX id of the shipped ${pkg.licenseFile}.`);
  const reserved=reservedFontNames(notice);
  pkg.hasReservedFontName=reserved.length>0;
  pkg.reservedFontNames=reserved;
  pkg.version=installed.version;
  pkg.source=`https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`;
  pkg.licenseSha256=hash(await readFile(path.join(directory,pkg.licenseFile)));
  for(const face of pkg.faces)face.sha256=hash(await readFile(path.join(directory,face.file)));
  // Keep the notice metadata next to the license fields.
  const keys=Object.keys(pkg).filter(key=>!['hasReservedFontName','reservedFontNames'].includes(key));
  keys.splice(keys.indexOf('licenseSha256')+1,0,'hasReservedFontName','reservedFontNames');
  manifest.packages[index]=Object.fromEntries(keys.map(key=>[key,pkg[key]]));
}
const contents=`// Generated deliberately by scripts/update-font-manifest.mjs; never during build/install.\nconst freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};\nexport const BUNDLED_FONT_MANIFEST=freeze(${JSON.stringify(manifest,null,2)});\n`;
await writeFile(new URL('../src/font-manifest.js',import.meta.url),contents);
console.log('Updated font manifest. Review provenance, licenses, hashes, style metadata and raster differences before committing.');
