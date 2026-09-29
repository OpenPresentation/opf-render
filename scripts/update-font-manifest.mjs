// Explicit maintenance command: review any changed bytes and licenses before committing.
//   node scripts/update-font-manifest.mjs            re-hash the installed npm packages (base, office, scripts) and the vendored faces
//   node scripts/update-font-manifest.mjs --vendor   also re-fetch every vendored package (FF-31 open pack)
// Vendored families live in fonts/open/<family>/: only the listed faces, the upstream license notice as OFL.txt
// and PROVENANCE.json. --vendor runs `npm pack <name>@<version>` for the version recorded in the manifest (it needs
// network and a `tar` on PATH), reads the SPDX id from the notice the package ships, refuses a package without a
// permissive font license (OFL-1.1, Apache-2.0, MIT, UFL-1.0), copies only the faces listed in the manifest and
// rewrites the hashes. To bump a family, edit its manifest version (and faces), run --vendor, then review the diff.
import {readFile,writeFile,mkdir,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
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
const vendorMode=process.argv.includes('--vendor');
const repoRoot=fileURLToPath(new URL('../',import.meta.url));
const root=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const manifest=structuredClone(BUNDLED_FONT_MANIFEST);

function checkNotice(pkg,notice,label){
  const spdx=detectSpdx(notice);
  assert.ok(ALLOWED_SPDX.includes(spdx),`${pkg.name} ships ${label} without a permissive font license (OFL-1.1, Apache-2.0, MIT, UFL-1.0); do not bundle it.`);
  assert.equal(pkg.license,spdx,`${pkg.name}: the manifest license must equal the SPDX id of the shipped ${label}.`);
  const reserved=reservedFontNames(notice);
  pkg.hasReservedFontName=reserved.length>0;
  pkg.reservedFontNames=reserved;
}
// Fetch the recorded upstream version and copy only the listed faces and the notice into the vendored directory.
async function fetchUpstream(pkg,target){
  const work=await mkdtemp(path.join(tmpdir(),'opf-vendor-'));
  try{
    // Prefer the npm that launched this script; otherwise the npm on PATH (a .cmd shim on Windows).
    const cli=process.env.npm_execpath?.endsWith('npm-cli.js')?process.env.npm_execpath:undefined;
    const npm=cli?process.execPath:process.platform==='win32'?'npm.cmd':'npm';
    const run=(command,args)=>{
      const full=cli&&command===npm?[cli,...args]:args;
      const result=spawnSync(command,full,{cwd:work,encoding:'utf8',shell:!cli&&process.platform==='win32'&&command===npm});
      assert.equal(result.status,0,`${command} ${full.join(' ')} failed: ${result.stderr}`);
      return result.stdout;
    };
    const packed=JSON.parse(run(npm,['pack',`${pkg.name}@${pkg.version}`,'--json','--pack-destination','.','--ignore-scripts']))[0];
    assert.equal(packed.version,pkg.version,`${pkg.name}: fetched ${packed.version}, expected ${pkg.version}`);
    run('tar',['-xzf',packed.filename]);
    const upstream=path.join(work,'package');
    checkNotice(pkg,await readFile(path.join(upstream,pkg.upstreamLicenseFile),'utf8'),pkg.upstreamLicenseFile);
    await rm(target,{recursive:true,force:true});
    await mkdir(target,{recursive:true});
    await copyFile(path.join(upstream,pkg.upstreamLicenseFile),path.join(target,pkg.licenseFile));
    for(const face of pkg.faces)await copyFile(path.join(upstream,face.upstreamFile),path.join(target,face.file));
    pkg.integrity=packed.integrity;
  }finally{await rm(work,{recursive:true,force:true});}
}

for(const [index,pkg] of manifest.packages.entries()){
  if(pkg.vendored){
    assert.ok(!root.dependencies?.[pkg.name],`${pkg.name} is vendored; remove it from dependencies.`);
    const target=path.join(repoRoot,pkg.vendored);
    if(vendorMode)await fetchUpstream(pkg,target);
    checkNotice(pkg,await readFile(path.join(target,pkg.licenseFile),'utf8'),pkg.licenseFile);
    pkg.source=`https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`;
    pkg.licenseSha256=hash(await readFile(path.join(target,pkg.licenseFile)));
    for(const face of pkg.faces)face.sha256=hash(await readFile(path.join(target,face.file)));
    // Provenance beside the faces: what is needed to re-fetch and verify them, written from the manifest only.
    const provenance={
      upstream:{package:pkg.name,version:pkg.version,source:pkg.source,...(pkg.integrity?{integrity:pkg.integrity}:{})},
      license:pkg.license,licenseFile:pkg.licenseFile,upstreamLicenseFile:pkg.upstreamLicenseFile,licenseSha256:pkg.licenseSha256,
      hasReservedFontName:pkg.hasReservedFontName,reservedFontNames:pkg.reservedFontNames,
      ...(pkg.renamedFrom?{renamedFrom:pkg.renamedFrom}:{}),
      faces:pkg.faces.map(face=>({file:face.file,upstreamFile:face.upstreamFile,family:face.family,weight:face.weight,italic:face.italic,sha256:face.sha256})),
    };
    await writeFile(path.join(target,'PROVENANCE.json'),JSON.stringify(provenance,null,2)+'\n');
  }else{
    const directory=path.dirname(require.resolve(`${pkg.name}/package.json`));
    const installed=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));
    // Base and office packs are runtime dependencies. The script pack (FF-19) is an optional
    // peer that development pins exactly as a devDependency. The open pack is vendored (FF-31).
    const pinned=pkg.pack==='scripts'?root.devDependencies?.[pkg.name]:root.dependencies?.[pkg.name];
    assert.equal(pinned,installed.version,`Pin ${pkg.name} exactly before reviewing an updated font manifest.`);
    if(pkg.pack==='scripts'){
      assert.equal(root.peerDependencies?.[pkg.name],installed.version,`Declare ${pkg.name} as an exact optional peer.`);
      assert.equal(root.peerDependenciesMeta?.[pkg.name]?.optional,true,`Declare ${pkg.name} as an optional peer.`);
    }
    checkNotice(pkg,await readFile(path.join(directory,pkg.licenseFile),'utf8'),pkg.licenseFile);
    pkg.version=installed.version;
    pkg.source=`https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`;
    pkg.licenseSha256=hash(await readFile(path.join(directory,pkg.licenseFile)));
    for(const face of pkg.faces)face.sha256=hash(await readFile(path.join(directory,face.file)));
  }
  // Keep the notice metadata next to the license fields.
  const keys=Object.keys(pkg).filter(key=>!['hasReservedFontName','reservedFontNames'].includes(key));
  keys.splice(keys.indexOf('licenseSha256')+1,0,'hasReservedFontName','reservedFontNames');
  manifest.packages[index]=Object.fromEntries(keys.map(key=>[key,pkg[key]]));
}
const contents=`// Generated deliberately by scripts/update-font-manifest.mjs; never during build/install.\nconst freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};\nexport const BUNDLED_FONT_MANIFEST=freeze(${JSON.stringify(manifest,null,2)});\n`;
await writeFile(new URL('../src/font-manifest.js',import.meta.url),contents);
console.log(`Updated font manifest${vendorMode?' from freshly fetched upstream packages':''}. Review provenance, licenses, hashes, style metadata and raster differences before committing.`);
