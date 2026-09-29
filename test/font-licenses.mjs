// FF-31: every bundled font package must carry a verified, allowed license.
// The license is read from the LICENSE/OFL file the installed package ships, detected by text, and compared
// with what src/font-manifest.js declares and with the allowlist. File and license hashes must still match.
// New manifest entries must include license, licenseFile, licenseSha256, reservedFontNames, upstream and copyright:
// run `node scripts/update-font-manifest.mjs` to fill them from the installed package.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {BUNDLED_FONT_MANIFEST} from '../src/font-manifest.js';
import {ALLOWED_FONT_LICENSES,RFN_PENDING_UNMODIFIED_UPSTREAM,copyrightLine,declaresReservedFontName,detectLicense,detectLicenses,isUnmodifiedUpstreamUrl,reservedFontNames,upstreamUrl} from '../scripts/font-license.mjs';

const require=createRequire(import.meta.url),hash=data=>createHash('sha256').update(data).digest('hex');
const rootPackage=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));

// Detector self-checks: each allowed license is recognised, copyleft and unknown texts are not accepted.
const mitText='MIT License\n\nCopyright (c) 2020 Example\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.\n';
const oflDivider='-----------------------------------------------------------\nSIL OPEN FONT LICENSE Version 1.1 - 26 February 2007\n-----------------------------------------------------------\n';
const fixtures={
  'OFL-1.1':`Copyright 2020 The X Project Authors, with Reserved Font Name "X"\n\n${oflDivider}`,
  'Apache-2.0':'                                 Apache License\n                           Version 2.0, January 2004\n',
  'UFL-1.0':'-------------------------------\nUBUNTU FONT LICENCE Version 1.0\n-------------------------------\n',
  'Bitstream-Vera':'Copyright (c) 2003 by Bitstream, Inc. Bitstream Vera is a trademark of Bitstream, Inc.\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of the fonts accompanying this license ("Fonts") and associated documentation files.\n',
  MIT:mitText,
};
for(const [id,text] of Object.entries(fixtures)){
  assert.equal(detectLicense(text),id,`detector must recognise ${id}`);
  assert.ok(ALLOWED_FONT_LICENSES.includes(id),`${id} is on the allowlist`);
}
assert.equal(detectLicense('GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007'),'GPL');
assert.equal(detectLicense('GNU LESSER GENERAL PUBLIC LICENSE\nVersion 3'),'LGPL');
assert.equal(detectLicense('GNU AFFERO GENERAL PUBLIC LICENSE\nVersion 3'),'AGPL');
for(const id of ['GPL','LGPL','AGPL','proprietary'])assert.ok(!ALLOWED_FONT_LICENSES.includes(id),`${id} must not be allowed`);
assert.equal(detectLicense('Copyright (c) Some Foundry. All rights reserved. Not for redistribution.'),null,'unrecognised text has no license');
assert.deepEqual(detectLicenses(`${fixtures['OFL-1.1']}\n${mitText}`),['OFL-1.1','MIT'],'mixed texts are reported as mixed');
assert.equal(detectLicense(`${fixtures['OFL-1.1']}\n${mitText}`),null,'mixed texts are not accepted as one license');
assert.deepEqual(reservedFontNames(fixtures['OFL-1.1']),['X']);
assert.deepEqual(reservedFontNames(`Copyright 2020 The Y Authors (https://example.test/y)\n\n${oflDivider}"Reserved Font Name" refers to any names specified as such after the copyright statement(s).\n`),[],'the OFL definition of RFN is not a declaration');
assert.equal(upstreamUrl('Copyright 2011 The Roboto Project Authors (https://github.com/googlefonts/roboto-classic)\n'),'https://github.com/googlefonts/roboto-classic');
assert.equal(copyrightLine('\n  Copyright 2011 A\nrest'),'Copyright 2011 A');

assert.ok(declaresReservedFontName(fixtures['OFL-1.1']));
assert.ok(!declaresReservedFontName(`Copyright 2020 The Y Authors

${oflDivider}"Reserved Font Name" refers to any names specified as such after the copyright statement(s).
`));
const pinnedRaw='https://raw.githubusercontent.com/google/fonts/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/carlito/Carlito-Regular.ttf';
assert.ok(isUnmodifiedUpstreamUrl(pinnedRaw));
assert.ok(!isUnmodifiedUpstreamUrl(pinnedRaw.replace('23e54b51ddffbc7713c583748e3bd86f62b1fa4a','main')),'a branch name is not a pin');
assert.ok(!isUnmodifiedUpstreamUrl(pinnedRaw.replace('/google/fonts/','/someone/else/')),'repository must be allowlisted');
assert.ok(!isUnmodifiedUpstreamUrl('https://www.npmjs.com/package/@fontsource/raleway/v/5.3.0'),'a repackaged npm file is not upstream');

// Manifest checks against the installed packages.
const packages=BUNDLED_FONT_MANIFEST.packages;
assert.ok(packages.length>0,'the manifest bundles at least one font package');
const rows=[],rfnPackages=[];
for(const pkg of packages){
  const label=`${pkg.name}@${pkg.version}`;
  for(const field of ['name','version','pack','source','license','licenseFile','licenseSha256','reservedFontNames','upstream','copyright'])
    assert.ok(pkg[field]!==undefined&&pkg[field]!==null&&pkg[field]!=='',`${label}: manifest entry is missing "${field}"; run scripts/update-font-manifest.mjs`);
  assert.ok(Array.isArray(pkg.reservedFontNames)&&pkg.reservedFontNames.every(name=>typeof name==='string'&&name),`${label}: reservedFontNames must be an array of names (empty when none)`);
  assert.match(pkg.upstream,/^https?:\/\//,`${label}: upstream must be a URL`);
  assert.equal(pkg.source,`https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`,`${label}: source must be the exact npm package URL`);
  assert.ok(ALLOWED_FONT_LICENSES.includes(pkg.license),`${label}: ${pkg.license} is not an allowed bundled-font license (${ALLOWED_FONT_LICENSES.join(', ')})`);

  const pinned=(pkg.pack==='scripts'?rootPackage.devDependencies:rootPackage.dependencies)?.[pkg.name];
  assert.equal(pinned,pkg.version,`${label}: package.json must pin this exact version (no range)`);
  assert.match(pinned,/^\d+\.\d+\.\d+$/,`${label}: pin must be an exact version`);

  const directory=path.dirname(require.resolve(`${pkg.name}/package.json`));
  const installed=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));
  assert.equal(installed.version,pkg.version,`${label}: installed version differs from the manifest`);
  assert.ok(String(installed.license??'').split(/\s+(?:AND|OR)\s+|[\s()]+/).includes(pkg.license),`${label}: installed package.json license "${installed.license}" does not mention ${pkg.license}`);

  const licenseBytes=await readFile(path.join(directory,pkg.licenseFile)),licenseText=licenseBytes.toString('utf8');
  assert.equal(hash(licenseBytes),pkg.licenseSha256,`${label}: license file sha256 changed`);
  const detected=detectLicenses(licenseText);
  assert.deepEqual(detected,[pkg.license],`${label}: declared ${pkg.license} but ${pkg.licenseFile} reads as ${detected.join('+')||'an unrecognised license'}`);
  assert.deepEqual(reservedFontNames(licenseText),[...pkg.reservedFontNames].sort(),`${label}: reservedFontNames differ from the copyright block in ${pkg.licenseFile}`);
  assert.equal(copyrightLine(licenseText),pkg.copyright,`${label}: copyright differs from ${pkg.licenseFile}`);
  assert.equal(upstreamUrl(licenseText),pkg.upstream,`${label}: upstream differs from ${pkg.licenseFile}`);

  // RFN rule (owner decision 2026-09-29): a family that declares a Reserved Font Name ships the unmodified upstream files.
  const declaresRfn=declaresReservedFontName(licenseText);
  assert.ok(!declaresRfn||pkg.reservedFontNames.length>0,`${label}: the license declares a Reserved Font Name that could not be parsed`);
  if(pkg.reservedFontNames.length>0){
    rfnPackages.push(pkg.name);
    const proven=pkg.faces.every(face=>face.upstreamFile&&isUnmodifiedUpstreamUrl(face.upstreamFile.url)&&face.upstreamFile.sha256===face.sha256);
    if(proven)assert.ok(!(pkg.name in RFN_PENDING_UNMODIFIED_UPSTREAM),`${label}: ships unmodified upstream files now; remove it from RFN_PENDING_UNMODIFIED_UPSTREAM`);
    else assert.ok(pkg.name in RFN_PENDING_UNMODIFIED_UPSTREAM,`${label} declares Reserved Font Name ${pkg.reservedFontNames.join(', ')}: every face needs upstreamFile { url, sha256 } with a pinned URL from an allowlisted upstream repository and a sha256 equal to the face's own (byte-identical, not subsetted, instanced or converted)`);
  }else assert.ok(!(pkg.name in RFN_PENDING_UNMODIFIED_UPSTREAM),`${label}: declares no Reserved Font Name; remove it from RFN_PENDING_UNMODIFIED_UPSTREAM`);

  assert.ok(pkg.faces.length>0,`${label}: no faces listed`);
  for(const face of pkg.faces){
    assert.ok(!path.isAbsolute(face.file)&&!face.file.split(/[\\/]/).includes('..'),`${label}: face path must stay inside the package: ${face.file}`);
    assert.equal(hash(await readFile(path.join(directory,face.file))),face.sha256,`${label}: ${face.file} sha256 changed`);
    rows.push({label,declared:pkg.license,detected:detected.join('+'),rfn:pkg.reservedFontNames.join(',')||'none',face:`${face.family} ${face.weight}${face.italic?' italic':''}`});
  }
}
assert.equal(new Set(packages.map(pkg=>pkg.name)).size,packages.length,'each package appears once in the manifest');
for(const name of Object.keys(RFN_PENDING_UNMODIFIED_UPSTREAM))assert.ok(packages.some(pkg=>pkg.name===name),`${name} is in RFN_PENDING_UNMODIFIED_UPSTREAM but not in the manifest`);
console.log(`Font licenses verified for ${packages.length} packages, ${rows.length} faces. Reserved Font Names: ${rfnPackages.length} packages, all ${rfnPackages.length===Object.keys(RFN_PENDING_UNMODIFIED_UPSTREAM).length?'pending a switch to unmodified upstream files':'with proven or pending upstream files'}.`);
if(process.argv.includes('--table'))for(const row of rows)console.log(`${row.face}\t${row.label}\tdeclared ${row.declared}\tdetected ${row.detected}\tRFN ${row.rfn}`);
