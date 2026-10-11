import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,lstatSync,readdirSync,realpathSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readBaseline,writeBaseline} from '../test/golden-store.mjs';
export function candidatePlan({core,gallery,selection='examples',name}) {
  for(const [key,value] of Object.entries({core,gallery})) assert.match(value??'',/^[0-9a-f]{40}$/,`${key} must be an exact commit SHA`);
  assert.ok(['examples','templates','both'].includes(selection),'invalid selection');
  assert.match(name??'',/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/,'invalid baseline name');
  assert.notEqual(name,'cover-centering','preserve the published baseline');
  return {core,gallery,examples:selection!=='templates',templates:selection!=='examples',baseline:`test/golden/opf-examples-png.${name}`,template:'test/golden/layout-templates-0.19.json'};
}
export function verifyManifest(next,previous,count,template=false) {
  assert.match(next.source?.sha256??'',/^[0-9a-f]{64}$/,'invalid source digest');
  assert.deepEqual(Object.keys(next.source).sort(),Object.keys(previous.source).sort(),'source fields changed');
  if(template){assert.equal(next.source.templates,28);assert.ok(typeof next.source.fixture==='string'&&next.source.fixture.length>0);}else{for(const key of ['repository','path'])assert.equal(next.source[key],previous.source[key]);assert.equal(next.source.decks,new Set(Object.keys(next.entries).map(k=>k.slice(0,k.lastIndexOf('#')))).size);}
  for(const entry of Object.values(next.entries))assert.ok(Number.isSafeInteger(entry.bytes)&&entry.bytes>0,'invalid entry bytes');
  for(const key of ['version','format','scale','systemFonts',...(template?['trace']:[])]) assert.deepEqual(next[key],previous[key],`golden ${key} changed`);
  assert.equal(Object.keys(next.entries).length,count,'candidate corpus count changed');
  assert.deepEqual(Object.keys(next.entries).sort(),Object.keys(previous.entries).sort(),'candidate dropped or added cases');
  for(const entry of Object.values(next.entries)) for(const field of template?['svg','png']:['sha256']) assert.match(entry[field],/^[0-9a-f]{64}$/,'invalid hash');
}
export function verifyHead(expected,actual){assert.match(expected,/^[0-9a-f]{40}$/);assert.equal(actual,expected,'branch moved during generation');}
export function regularTree(target){if(!existsSync(target))return;const stat=lstatSync(target);assert.ok(!stat.isSymbolicLink(),'symlink in promotion tree');if(stat.isDirectory())for(const name of readdirSync(target))regularTree(path.join(target,name));else assert.ok(stat.isFile(),'nonregular promotion file');}
export function readArtifact(file){assert.equal(realpathSync(file),path.resolve(file),'aliased artifact path');assert.ok(lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink(),'artifact is not a regular file');return JSON.parse(readFileSync(file,'utf8'));}
export function verifyGraph(graph,plan,head,candidates){assert.deepEqual(graph,{renderer:head,core:plan.core,gallery:plan.gallery,selection:plan.examples?(plan.templates?'both':'examples'):'templates',sources:Object.fromEntries(Object.entries(candidates).map(([key,value])=>[key,value.source.sha256]))},'artifact graph differs from selected source graph');}
export function verifyGuard(candidate,expected){assert.deepEqual(candidate,expected,'unchanged main golden does not reproduce');}
export function safeTarget(root,relative){const target=path.join(realpathSync(root),relative);let current=target;while(!existsSync(current))current=path.dirname(current);assert.equal(realpathSync(current),current,'aliased promotion path');regularTree(target);return target;}
export function allowedPaths(plan,files){for(const file of files) assert.ok(!file.includes('..')&&!path.isAbsolute(file)&&((plan.examples&&file.startsWith(plan.baseline+'/'))||(plan.templates&&file===plan.template)),`unexpected promotion path ${file}`);}
export function linkSources(workspace,plan){
 const root=realpathSync(workspace),core=path.join(root,'opf'),gallery=path.join(root,'gallery-candidate'),renderer=path.join(root,'opf-render');
 for(const [dir,sha,name]of[[core,plan.core,'@openpresentation/opf'],[gallery,plan.gallery,'@openpresentation/gallery']]){assert.equal(execFileSync('git',['-C',dir,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),sha);assert.equal(JSON.parse(readFileSync(path.join(dir,'package.json'),'utf8')).name,name==='@openpresentation/opf'?'openpresentation-workspace':name);}
 assert.equal(JSON.parse(readFileSync(path.join(gallery,'package.json'),'utf8')).opf.catalogSchema,2);
 for(const [dir,name,target]of[[core,'gallery',gallery],[path.join(core,'packages/javascript'),'gallery',gallery],[renderer,'gallery',gallery],[renderer,'opf',path.join(core,'packages/javascript')]]){const parent=path.join(dir,'node_modules/@openpresentation');mkdirSync(parent,{recursive:true});assert.equal(realpathSync(parent),parent,'aliased package parent');const dest=path.join(parent,name);rmSync(dest,{recursive:true,force:true});symlinkSync(target,dest,process.platform==='win32'?'junction':'dir');}
}
const toolsRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,...args]=process.argv.slice(2);const get=k=>args[args.indexOf('--'+k)+1];const root=args.includes('--root')?path.resolve(get('root')):toolsRoot;const plan=candidatePlan({core:get('core'),gallery:get('gallery'),selection:get('selection'),name:get('name')});
 if(command==='plan'){if(args.includes('--head'))verifyHead(get('head'),get('head'));if(args.includes('--branch')){const branch=get('branch');assert.match(branch,/^[A-Za-z0-9][A-Za-z0-9._/-]*$/);assert.ok(branch!=='main'&&!branch.includes('..')&&!branch.includes('//')&&!branch.endsWith('/')&&!branch.endsWith('.lock')&&!/^(refs\/|origin\/|pull\/)/.test(branch)&&!/^[0-9a-f]{40}$/.test(branch),'invalid candidate branch');}if(process.env.GITHUB_OUTPUT)writeFileSync(process.env.GITHUB_OUTPUT,`baseline=${plan.baseline}\nexamples=${plan.examples}\ntemplates=${plan.templates}\n`,{flag:'a'});console.log(JSON.stringify(plan));}
 else if(command==='link')linkSources(get('workspace'),plan);
 else if(command==='guard')verifyGuard(readArtifact(get('candidate')),readBaseline(get('baseline')));
 else if(command==='verify'){
  if(plan.examples)verifyManifest(JSON.parse(readFileSync(path.join(root,'artifacts/golden/candidate.json'))),readBaseline(path.join(root,'test/golden/opf-examples-png.cover-centering')),807);
  if(plan.templates)verifyManifest(JSON.parse(readFileSync(path.join(root,'artifacts/template-goldens/candidate.json'))),JSON.parse(readFileSync(path.join(root,plan.template))),498,true);
  const candidates={};if(plan.examples)candidates.examples=readArtifact(path.join(root,'artifacts/golden/candidate.json'));if(plan.templates)candidates.templates=readArtifact(path.join(root,'artifacts/template-goldens/candidate.json'));
  const graph={renderer:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),core:plan.core,gallery:plan.gallery,selection:get('selection'),sources:Object.fromEntries(Object.entries(candidates).map(([key,value])=>[key,value.source.sha256]))};
  writeFileSync(path.join(root,'artifacts/candidate-graph.json'),JSON.stringify(graph,null,2)+'\n');
 }else if(command==='apply'){
  verifyHead(get('head'),execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim());
  assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:root,encoding:'utf8'}),'','promotion checkout must be clean');
  const artifact=get('artifact'),candidates={};if(plan.examples)candidates.examples=readArtifact(path.join(artifact,'golden/candidate.json'));if(plan.templates)candidates.templates=readArtifact(path.join(artifact,'template-goldens/candidate.json'));
  verifyGraph(readArtifact(path.join(artifact,'candidate-graph.json')),plan,get('head'),candidates);
  if(plan.examples){verifyManifest(candidates.examples,readBaseline(path.join(root,'test/golden/opf-examples-png.cover-centering')),807);safeTarget(root,plan.baseline);}
  if(plan.templates){verifyManifest(candidates.templates,readArtifact(path.join(root,plan.template)),498,true);safeTarget(root,plan.template);}
  if(plan.examples){const next=candidates.examples,previous=readBaseline(path.join(root,'test/golden/opf-examples-png.cover-centering'));verifyManifest(next,previous,807);writeBaseline(safeTarget(root,plan.baseline),next);}
  if(plan.templates){const next=candidates.templates;verifyManifest(next,JSON.parse(readFileSync(path.join(root,plan.template))),498,true);writeFileSync(safeTarget(root,plan.template),JSON.stringify(next,null,1)+'\n');}
  const files=execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:root,encoding:'utf8'}).split('\n').filter(Boolean).map(line=>line.slice(3));allowedPaths(plan,files);
 }else throw Error('unknown command');
}
