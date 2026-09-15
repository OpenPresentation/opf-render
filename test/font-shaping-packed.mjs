import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const npmCli=process.env.npm_execpath;
assert.ok(npmCli?.endsWith('npm-cli.js'),'Run with npm run test:shaping-packed');
const temporary=await mkdtemp(path.join(tmpdir(),'opf-shaping-installed-'));
const npm=(args,cwd)=>execFileSync(process.execPath,[npmCli,...args],{cwd,encoding:'utf8',maxBuffer:16*1024*1024});
const packed=JSON.parse(npm(['pack','--json','--pack-destination',temporary],root))[0];
const core=path.resolve(root,'../opf/packages/javascript');
const corePack=JSON.parse(npm(['pack','--ignore-scripts','--json','--pack-destination',temporary],core))[0];
const consumer=path.join(temporary,'consumer');await mkdir(path.join(consumer,'test'),{recursive:true});
const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
await writeFile(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module',devDependencies:{
  esbuild:manifest.devDependencies.esbuild,playwright:manifest.devDependencies.playwright,typescript:'5.9.3',wawoff2:manifest.devDependencies.wawoff2,
}}));
npm(['install','--ignore-scripts','--no-fund','--no-audit',path.join(temporary,packed.filename),path.join(temporary,corePack.filename)],consumer);
const installed=path.join(consumer,'node_modules/@openpresentation/opf-render');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files={};
for(const file of packed.files){
  const bytes=await readFile(path.join(installed,file.path));
  assert.equal(hash(bytes),hash(await readFile(path.join(root,file.path))));
  files[file.path]=hash(bytes);
}
for(const entry of ['dist/font-shaping.js','dist/font-shaping-browser.js','dist/font-shaping-service.js','dist/font-shaping.d.ts','dist/harfbuzz-browser.js','dist/harfbuzz.wasm','dist/harfbuzzjs-LICENSE','dist/HarfBuzz-LICENSE','dist/font-preparation.js','dist/font-woff2.js','dist/WOFF2-LICENSE','dist/WOFF2-LICENSE_THIRD_PARTY','dist/Brotli-LICENSE','dist/Brotli-LICENSE_THIRD_PARTY'])assert.ok(files[entry]);
const modules={'font-shaping.js':'font-shaping','fonts.js':'fonts','fonts-node.js':'fonts-node','svg.js':'svg'};
await writeFile(path.join(consumer,'test/font-container-fixtures.mjs'),await readFile(path.join(root,'test/font-container-fixtures.mjs')));
await writeFile(path.join(consumer,'test/font-woff2-hmtx-fixtures.mjs'),await readFile(path.join(root,'test/font-woff2-hmtx-fixtures.mjs')));
await writeFile(path.join(consumer,'test/font-woff2-collections-fixtures.mjs'),await readFile(path.join(root,'test/font-woff2-collections-fixtures.mjs')));
for(const name of ['font-shaping.mjs','font-shaping-formats.mjs','font-woff2-reconstruction.mjs','font-woff2-hmtx.mjs','font-woff2-collections.mjs','font-shaping-browser.mjs']){
  let source=await readFile(path.join(root,'test',name),'utf8');
  for(const [file,entry]of Object.entries(modules))source=source.replaceAll(`'../dist/${file}'`,`'@openpresentation/opf-render/${entry}'`);
  await writeFile(path.join(consumer,'test',name),source);
  process.stdout.write(execFileSync(process.execPath,[path.join('test',name)],{cwd:consumer,encoding:'utf8',maxBuffer:8*1024*1024}));
}
await writeFile(path.join(consumer,'types.mts'),`import {loadHarfBuzzShaper} from '@openpresentation/opf-render/font-shaping';
import {loadOfficeFontRegistry} from '@openpresentation/opf-render/fonts-node';
const service=await loadHarfBuzzShaper({language:'en',features:['liga=0']});
const registry=await loadOfficeFontRegistry({fontShaper:service,maxPreparedFontBytes:64*1024*1024});
const signatureRemoved:boolean=registry.fontPreparations[0].removedSignature;
const embeddingReason:'woff2-hmtx-compatibility'|undefined=registry.fontPreparations[0].embeddingReason;
const retainedSource:string|undefined=registry.embeddedFonts[0].sourceDataUrl;
const run=registry.shapeText?.('source',{fontFamily:'Roboto',fontWeight:400});
const offset:number|undefined=run?.glyphs[0]?.sourceStart;
registry.dispose();
`);
for(const mode of ['NodeNext','Bundler'])execFileSync(process.execPath,[path.join(consumer,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module',mode==='NodeNext'?'NodeNext':'ESNext','--moduleResolution',mode,'types.mts'],{cwd:consumer,stdio:'inherit'});
const audit=JSON.parse(npm(['audit','--json'],consumer));assert.equal(audit.metadata.vulnerabilities.total,0);
const browser=JSON.parse(await readFile(path.join(consumer,'artifacts/font-shaping/browser/report.json')));
const report={node:process.version,consumer,renderer:packed.integrity,core:corePack.integrity,files,browser,
  types:['TypeScript 5.9.3 NodeNext','TypeScript 5.9.3 Bundler'],knownVulnerabilities:0,
  scope:'Fresh candidate tarballs, shipped-file hashes, Node and offline browser shaping, explicit failures and TypeScript. Not registry publication or native acceptance.'};
await mkdir(path.join(root,'artifacts/font-shaping'),{recursive:true});
await writeFile(path.join(root,'artifacts/font-shaping/installed.json'),JSON.stringify(report,null,2)+'\n');
console.log(`Fresh shaping package passed; retained consumer ${consumer}`);
