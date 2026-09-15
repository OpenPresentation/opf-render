import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cp,mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
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
for(const entry of ['dist/font-carets.js','dist/font-direction.js','dist/font-direction-data.js','dist/Unicode-LICENSE','dist/font-shaping.js','dist/font-shaping-browser.js','dist/font-shaping-service.js','dist/font-shaping.d.ts','dist/harfbuzz-browser.js','dist/harfbuzz.wasm','dist/harfbuzzjs-LICENSE','dist/HarfBuzz-LICENSE','dist/font-preparation.js','dist/font-variations.js','dist/font-normalization.js','dist/font-dfont.js','dist/font-woff2.js','dist/WOFF2-LICENSE','dist/WOFF2-LICENSE_THIRD_PARTY','dist/Brotli-LICENSE','dist/Brotli-LICENSE_THIRD_PARTY'])assert.ok(files[entry]);
const modules={'font-shaping.js':'font-shaping','fonts.js':'fonts','fonts-node.js':'fonts-node','svg.js':'svg'};
await writeFile(path.join(consumer,'test/font-container-fixtures.mjs'),await readFile(path.join(root,'test/font-container-fixtures.mjs')));
await writeFile(path.join(consumer,'test/font-woff2-hmtx-fixtures.mjs'),await readFile(path.join(root,'test/font-woff2-hmtx-fixtures.mjs')));
await writeFile(path.join(consumer,'test/font-woff2-collections-fixtures.mjs'),await readFile(path.join(root,'test/font-woff2-collections-fixtures.mjs')));
await writeFile(path.join(consumer,'test/font-dfont-fixtures.mjs'),await readFile(path.join(root,'test/font-dfont-fixtures.mjs')));
await cp(path.join(root,'test/fixtures/font-formats'),path.join(consumer,'test/fixtures/font-formats'),{recursive:true});
for(const name of ['font-variations-fixtures.mjs','font-variations-browser.mjs','font-painting-fixtures.mjs'])await writeFile(path.join(consumer,'test',name),await readFile(path.join(root,'test',name)));
for(const name of ['font-dfont.mjs','font-shaping.mjs','font-shaping-formats.mjs','font-woff2-reconstruction.mjs','font-woff2-hmtx.mjs','font-woff2-collections.mjs','font-shaping-browser.mjs','font-variations.mjs','font-normalization.mjs','font-painting.mjs','font-carets.mjs','font-caret-layout.mjs']){
  let source=await readFile(path.join(root,'test',name),'utf8');
  for(const [file,entry]of Object.entries(modules))source=source.replaceAll(`'../dist/${file}'`,`'@openpresentation/opf-render/${entry}'`);
  for(const file of ['font-normalization.js','font-variations.js','font-sfnt.js','font-direction.js','font-direction-data.js'])source=source.replaceAll(`'../dist/${file}'`,JSON.stringify(pathToFileURL(path.join(installed,'dist',file)).href));
  await writeFile(path.join(consumer,'test',name),source);
  process.stdout.write(execFileSync(process.execPath,[path.join('test',name)],{cwd:consumer,encoding:'utf8',maxBuffer:8*1024*1024}));
}
let paintingSource=await readFile(path.join(root,'test/font-painting-browser.mjs'),'utf8');
for(const [file,entry]of Object.entries(modules))paintingSource=paintingSource.replaceAll(`'../dist/${file}'`,`'@openpresentation/opf-render/${entry}'`);
await writeFile(path.join(consumer,'test/font-painting-browser.mjs'),paintingSource);
await writeFile(path.join(consumer,'types.mts'),`import {loadHarfBuzzShaper} from '@openpresentation/opf-render/font-shaping';
import {loadOfficeFontRegistry} from '@openpresentation/opf-render/fonts-node';
import {createFontRegistry,type FontFaceInput,type TextPainting} from '@openpresentation/opf-render/fonts';
import type {RenderSvgOptions} from '@openpresentation/opf-render/svg';
const service=await loadHarfBuzzShaper({language:'en',features:['liga=0']});
const registry=await loadOfficeFontRegistry({fontShaper:service,maxPreparedFontBytes:64*1024*1024});
const axisEntry:FontFaceInput={data:new Uint8Array(),variations:{wght:700,opsz:20}};
const namedEntry:FontFaceInput={data:new Uint8Array(),variations:'Bold'};
const varied=createFontRegistry([axisEntry,namedEntry],{fontShaper:service});
const axes:Record<string,number>|undefined=varied.embeddedFonts[0].variations;
const instance:string|undefined=varied.fontPreparations[0].namedInstance;
const face=service.createFace({data:axisEntry.data,unitsPerEm:1000,variations:{wght:700}});
face.dispose();varied.dispose();
const signatureRemoved:boolean=registry.fontPreparations[0].removedSignature;
const embeddingReason:'woff2-hmtx-compatibility'|'dfont-resource'|undefined=registry.fontPreparations[0].embeddingReason;
const retainedSource:string|undefined=registry.embeddedFonts[0].sourceDataUrl;
const run=registry.shapeText?.('source',{fontFamily:'Roboto',fontWeight:400});
const offset:number|undefined=run?.glyphs[0]?.sourceStart;
const painter:TextPainting|undefined=registry.textPainting;
const paintOptions:RenderSvgOptions={textMeasurement:registry.textMeasurement,textPainting:painter};
const caretOffset:number|undefined=painter?.shape('source',{fontFamily:'Roboto',fontWeight:400})?.caretGeometry?.stops[0]?.offset;
const glyphPath:string|undefined=painter?.shape('source',{fontFamily:'Roboto',fontWeight:400})?.glyphs[0]?.path;
registry.dispose();
`);
for(const mode of ['NodeNext','Bundler'])execFileSync(process.execPath,[path.join(consumer,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module',mode==='NodeNext'?'NodeNext':'ESNext','--moduleResolution',mode,'types.mts'],{cwd:consumer,stdio:'inherit'});
const audit=JSON.parse(npm(['audit','--json'],consumer));assert.equal(audit.metadata.vulnerabilities.total,0);
const browser=JSON.parse(await readFile(path.join(consumer,'artifacts/font-shaping/browser/report.json')));
const variableNode=JSON.parse(await readFile(path.join(consumer,'artifacts/font-shaping/variations.json')));
const normalization=JSON.parse(await readFile(path.join(consumer,'artifacts/font-shaping/normalization.json')));
const paintingNode=JSON.parse(await readFile(path.join(consumer,'artifacts/font-shaping/painting/node.json')));
const carets=JSON.parse(await readFile(path.join(consumer,'artifacts/font-shaping/carets/node.json')));
const report={carets,node:process.version,consumer,renderer:packed.integrity,core:corePack.integrity,files,browser,variableNode,normalization,paintingNode,
  types:['TypeScript 5.9.3 NodeNext','TypeScript 5.9.3 Bundler'],knownVulnerabilities:0,
  scope:'Fresh candidate tarballs, shipped-file hashes, Node and offline browser shaping, explicit failures and TypeScript. Not registry publication or native acceptance.'};
let paintingError;
try {
  process.stdout.write(execFileSync(process.execPath,['test/font-painting-browser.mjs'],{cwd:consumer,encoding:'utf8',maxBuffer:8*1024*1024}));
  report.paintingBrowserStatus='passed';
} catch(error) {
  paintingError=error;report.paintingBrowserStatus='failed';report.paintingBrowserFailure=String(error.stderr??error.message);
}
try { report.paintingBrowser=JSON.parse(await readFile(path.join(consumer,'artifacts/font-shaping/painting-browser/report.json'))); }
catch(error) { if(!paintingError)throw error;report.paintingBrowserReportError=error.message; }
let variableError;
try {
  process.stdout.write(execFileSync(process.execPath,['test/font-variations-browser.mjs'],{cwd:consumer,encoding:'utf8',maxBuffer:8*1024*1024}));
  report.variableBrowserStatus='passed';
} catch(error) {
  variableError=error;report.variableBrowserStatus='failed';
  report.variableBrowserFailure=String(error.stderr??error.message);
}
try { report.variableBrowser=JSON.parse(await readFile(path.join(consumer,'artifacts/font-shaping/variations-browser.json'))); }
catch(error) { if(!variableError)throw error;report.variableBrowserReportError=error.message; }
await mkdir(path.join(root,'artifacts/font-shaping'),{recursive:true});
await writeFile(path.join(root,'artifacts/font-shaping/installed.json'),JSON.stringify(report,null,2)+'\n');
if(paintingError||variableError)throw new AggregateError([paintingError,variableError].filter(Boolean),'Fresh painting or native variable-font acceptance failed; complete reports were retained.');
console.log(`Fresh shaping package passed; retained consumer ${consumer}`);
