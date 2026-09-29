// Explicit maintenance command: review any changed bytes and licenses before committing.
//   node scripts/update-font-manifest.mjs            re-hash installed npm packages (base, office, scripts) and the vendored faces
//   node scripts/update-font-manifest.mjs --vendor   also re-fetch every vendored package from its recorded upstream
//
// Vendored packs (FF-31) ship inside this package under `directory` (fonts/open/<family>/): only the listed faces, the
// upstream license notice as OFL.txt and a generated PROVENANCE.json. An entry is vendored from one of two places:
//   - commit: the copyright holder's repository at a full commit. Every face records upstreamFile { url, sha256 } with a
//     commit-pinned raw URL and a sha256 equal to the face's own (byte-identical, so an OFL Reserved Font Name may stay in
//     its name); the notice comes from upstreamLicenseUrl.
//   - npm (no commit): the recorded npm package version, for families with no Reserved Font Name; faces come from `npmFile`
//     and the notice from `npmLicenseFile`. `npm pack` needs network and a `tar` on PATH.
// --vendor downloads the recorded URLs or version, reads the SPDX id from the notice that ships, refuses a package
// without a permissive font license (OFL-1.1, Apache-2.0, MIT, UFL-1.0), copies only the listed faces and rewrites the
// hashes. To bump a family, edit its recorded commit or version (and face URLs), run --vendor, then review the diff.
import {readFile,writeFile,mkdir,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {BUNDLED_FONT_MANIFEST} from '../src/font-manifest.js';
import {ALLOWED_FONT_LICENSES,copyrightLine,detectLicenses,isUnmodifiedUpstreamUrl,reservedFontNames,upstreamUrl} from './font-license.mjs';
const require=createRequire(import.meta.url),hash=data=>createHash('sha256').update(data).digest('hex');
const vendorMode=process.argv.includes('--vendor');
const repoRoot=fileURLToPath(new URL('../',import.meta.url));
const root=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const manifest=structuredClone(BUNDLED_FONT_MANIFEST);
manifest.packages=manifest.packages.map(entry=>{
  // Keep the derived license fields directly before `faces` so every entry has the same shape.
  const ordered={};
  for(const [key,value] of Object.entries(entry)){
    if(key==='faces')Object.assign(ordered,{reservedFontNames:[],upstream:null,copyright:null});
    if(!['reservedFontNames','upstream','copyright'].includes(key))ordered[key]=value;
  }
  return ordered;
});

// FF-31: the license is read from the file that ships, never assumed from the source site.
function checkNotice(pkg,licenseText,label){
  const detected=detectLicenses(licenseText);
  assert.deepEqual(detected,[pkg.license],`${pkg.name} declares ${pkg.license} but its ${label} reads as ${detected.join('+')||'an unrecognised license'}.`);
  assert.ok(ALLOWED_FONT_LICENSES.includes(pkg.license),`${pkg.name} is licensed ${pkg.license}, which is not an allowed bundled-font license (${ALLOWED_FONT_LICENSES.join(', ')}).`);
  pkg.reservedFontNames=reservedFontNames(licenseText);
  pkg.upstream=upstreamUrl(licenseText);
  pkg.copyright=copyrightLine(licenseText);
}
async function download(url){
  const response=await fetch(url);
  assert.ok(response.ok,`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
// Vendor a commit-pinned upstream: each face and the notice are downloaded from their recorded raw URLs.
async function fetchCommit(pkg,target){
  assert.match(pkg.commit,/^[0-9a-f]{40}$/,`Pin ${pkg.name} to a full upstream commit.`);
  await rm(target,{recursive:true,force:true});
  await mkdir(target,{recursive:true});
  assert.ok(pkg.upstreamLicenseUrl?.includes(pkg.commit),`${pkg.name}: upstreamLicenseUrl must name the pinned commit.`);
  await writeFile(path.join(target,pkg.licenseFile),await download(pkg.upstreamLicenseUrl));
  for(const face of pkg.faces){
    assert.ok(face.upstreamFile.url.includes(pkg.commit),`${pkg.name}: ${face.file} URL must name the pinned commit.`);
    await writeFile(path.join(target,face.file),await download(face.upstreamFile.url));
  }
}
// Vendor an npm package version (families with no Reserved Font Name only).
async function fetchNpm(pkg,target){
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
    await rm(target,{recursive:true,force:true});
    await mkdir(target,{recursive:true});
    await copyFile(path.join(upstream,pkg.npmLicenseFile),path.join(target,pkg.licenseFile));
    for(const face of pkg.faces)await copyFile(path.join(upstream,face.npmFile),path.join(target,face.file));
    pkg.integrity=packed.integrity;
  }finally{await rm(work,{recursive:true,force:true});}
}

for(const [index,pkg] of manifest.packages.entries()){
  if(pkg.vendored){
    assert.ok(!root.dependencies?.[pkg.name],`${pkg.name} is vendored; remove it from dependencies.`);
    assert.match(pkg.directory,/^fonts\/[a-z0-9-]+(\/[a-z0-9-]+)*$/,`${pkg.name}: directory must be a fonts/ path.`);
    const target=path.join(repoRoot,pkg.directory);
    if(vendorMode)await (pkg.commit?fetchCommit:fetchNpm)(pkg,target);
    const licenseBytes=await readFile(path.join(target,pkg.licenseFile));
    checkNotice(pkg,licenseBytes.toString('utf8'),pkg.licenseFile);
    pkg.licenseSha256=hash(licenseBytes);
    for(const face of pkg.faces){
      face.sha256=hash(await readFile(path.join(target,face.file)));
      if(pkg.commit){
        // Byte-identical to the copyright holder's file at the pinned commit, or the RFN rule cannot be met.
        assert.ok(isUnmodifiedUpstreamUrl(face.upstreamFile?.url),`${pkg.name}: ${face.file} needs a pinned URL from an allowlisted upstream repository (scripts/font-license.mjs).`);
        if(!vendorMode&&face.upstreamFile.sha256&&face.upstreamFile.sha256!==face.sha256)assert.fail(`${pkg.name}: ${face.file} differs from its upstream file; re-vendor it instead of editing it.`);
        face.upstreamFile={url:face.upstreamFile.url,sha256:face.sha256};
      }
    }
    if(pkg.commit){
      const repository=/^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\//.exec(pkg.faces[0].upstreamFile.url)[1];
      pkg.source=`https://github.com/${repository}/tree/${pkg.commit}`;
    }else pkg.source=`https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`;
    // Provenance beside the faces: what is needed to re-fetch and verify them, written from the manifest only.
    const provenance={
      upstream:pkg.commit?{repository:pkg.source.replace(/\/tree\/.*/,''),commit:pkg.commit,release:pkg.version,source:pkg.source,licenseUrl:pkg.upstreamLicenseUrl}:{package:pkg.name,version:pkg.version,source:pkg.source,...(pkg.integrity?{integrity:pkg.integrity}:{})},
      license:pkg.license,licenseFile:pkg.licenseFile,licenseSha256:pkg.licenseSha256,
      reservedFontNames:pkg.reservedFontNames,copyright:pkg.copyright,
      ...(pkg.renamedFrom?{renamedFrom:pkg.renamedFrom}:{}),
      faces:pkg.faces.map(face=>({file:face.file,family:face.family,weight:face.weight,italic:face.italic,sha256:face.sha256,...(face.upstreamFile?{upstreamUrl:face.upstreamFile.url}:{npmFile:face.npmFile})})),
    };
    await writeFile(path.join(target,'PROVENANCE.json'),JSON.stringify(provenance,null,2)+'\n');
    // Stable key order: identity, vendoring, license, derived license fields, faces.
    const order=['name','version','pack','vendored','directory','commit','source','license','licenseFile','licenseSha256','upstreamLicenseUrl','npmLicenseFile','integrity','renamedFrom','reservedFontNames','upstream','copyright','faces'];
    assert.deepEqual(Object.keys(pkg).filter(key=>!order.includes(key)),[],`${pkg.name}: unknown manifest keys`);
    manifest.packages[index]=Object.fromEntries(order.filter(key=>pkg[key]!==undefined).map(key=>[key,pkg[key]]));
    continue;
  }
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
  checkNotice(pkg,await readFile(path.join(directory,pkg.licenseFile),'utf8'),pkg.licenseFile);
  pkg.version=installed.version;
  pkg.source=`https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`;
  pkg.licenseSha256=hash(await readFile(path.join(directory,pkg.licenseFile)));
  for(const face of pkg.faces)face.sha256=hash(await readFile(path.join(directory,face.file)));
}
const contents=`// Generated deliberately by scripts/update-font-manifest.mjs; never during build/install.\nconst freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};\nexport const BUNDLED_FONT_MANIFEST=freeze(${JSON.stringify(manifest,null,2)});\n`;
await writeFile(new URL('../src/font-manifest.js',import.meta.url),contents);
console.log(`Updated font manifest${vendorMode?' from freshly fetched upstream sources':''}. Review provenance, licenses, hashes, style metadata and raster differences before committing.`);
