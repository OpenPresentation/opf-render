import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {loadOfficeFontRegistry} from '../dist/fonts-node.js';
import {createFontRegistry} from '../dist/fonts.js';
import {create} from 'fontkit';
import wawoff2 from 'wawoff2';
import {makeCollection,makeWoff} from './font-container-fixtures.mjs';

const output = new URL('../artifacts/font-shaping/browser/',import.meta.url);
await mkdir(output,{recursive:true});
const shaper = await loadHarfBuzzShaper();
const fonts = await loadOfficeFontRegistry({fontShaper:shaper});
const texts = ['AVATAR office affine', '  Keep spaces  ', 'Ágj', 'o\u0302\u0301', 'ω\u0301', 'Ι\u0301'];
const faces = fonts.embeddedFonts.map(face=>({
  ...face,sha256:createHash('sha256').update(Buffer.from(face.dataUrl.split(',')[1],'base64')).digest('hex'),
  cases:texts.map(text=>{
    try {return {text,expected:fonts.shapeText(text,{fontFamily:face.family,fontWeight:face.weight,italic:face.italic})};}
    catch(error) {assert.equal(error.code,'missing-glyph');return {text,rejected:error.code};}
  }),
}));
const containers=[];
const decoded=face=>Buffer.from(face.dataUrl.split(',')[1],'base64');
for(const face of faces) {
  const data=decoded(face);
  for(const [format,bytes] of [['woff',makeWoff(data,true)],['woff2',Buffer.from(await wawoff2.compress(data))]])
    containers.push({format,family:face.family,weight:face.weight,italic:face.italic,reference:data.toString('base64'),data:bytes.toString('base64')});
}
const collectionFaces=faces.filter(face=>face.family==='Roboto'&&!face.italic&&[400,700].includes(face.weight));
const collection=makeCollection(collectionFaces.map(decoded)),collectionWoff2=Buffer.from(await wawoff2.compress(collection));
for(const face of collectionFaces)for(const [format,data]of [['collection',collection],['woff2-collection',collectionWoff2]])
  containers.push({format,family:face.family,weight:face.weight,italic:face.italic,reference:decoded(face).toString('base64'),data:data.toString('base64'),postscriptName:create(decoded(face)).postscriptName});
for(const fixture of containers) {
  const registry=createFontRegistry([{data:Buffer.from(fixture.reference,'base64'),family:'Candidate',weight:fixture.weight,italic:fixture.italic}],{fontShaper:shaper});
  fixture.expected=registry.shapeText('office AVATAR  123',{fontFamily:'Candidate',fontWeight:fixture.weight,italic:fixture.italic});
  registry.dispose();
}
const bundle = await build({
  stdin:{contents:"import {loadHarfBuzzShaper} from '@openpresentation/opf-render/font-shaping-browser'; import {loadBrowserFontRegistry} from '@openpresentation/opf-render/fonts-browser'; globalThis.fontTest={loadHarfBuzzShaper,loadBrowserFontRegistry};",resolveDir:fileURLToPath(new URL('../',import.meta.url))},
  bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,metafile:true,
});
assert.ok(!Object.keys(bundle.metafile.inputs).some(path=>path.endsWith('/raster.js')||path.includes('sharp')));
for (const item of Object.values(bundle.metafile.outputs)) assert.deepEqual(item.imports,[],'Browser build needs no Node or remote imports');
const bytes=bundle.outputFiles[0].contents;
await writeFile(new URL('bundle.js',output),bytes);
const wasm=await readFile(new URL(import.meta.resolve('@openpresentation/opf-render/harfbuzz.wasm')));
const requests=[],errors=[],observations=[];
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined});
try {
  const page=await browser.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  const contentSecurityPolicy="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; font-src 'self' data:; style-src 'unsafe-inline'";
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());requests.push(url.href);
    if(url.origin!=='https://opf-shaping.test') return route.abort();
    if(url.pathname==='/') return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':contentSecurityPolicy},body:'<!doctype html><meta charset="utf-8"><main></main><script type="module" src="/bundle.js"></script>'});
    if(url.pathname==='/bundle.js') return route.fulfill({contentType:'text/javascript',body:Buffer.from(bytes)});
    if(url.pathname==='/harfbuzz.wasm') return route.fulfill({contentType:'application/wasm',body:wasm});
    return route.abort();
  });
  await page.goto('https://opf-shaping.test/');
  await page.waitForFunction(()=>!!globalThis.fontTest);
  observations.push(...await page.evaluate(async faces=>{
    const shaper=await fontTest.loadHarfBuzzShaper();
    const entries=faces.map(face=>({family:face.family,weight:face.weight,italic:face.italic,license:face.license,
      data:Uint8Array.from(atob(face.dataUrl.split(',')[1]),c=>c.charCodeAt(0))}));
    const before=document.fonts.size;
    const registry=await fontTest.loadBrowserFontRegistry(entries,{fontShaper:shaper});
    if(document.fonts.size-before!==33) throw new Error('All 33 font faces must be registered');
    const results=[];
    for(const face of faces) for(const item of face.cases) {
      const style={fontFamily:face.family,fontWeight:face.weight,italic:face.italic};
      if(item.rejected) {
        let code;try{registry.shapeText(item.text,style);}catch(error){code=error.code;}
        results.push({style,text:item.text,rejected:code});continue;
      }
      const run=registry.shapeText(item.text,style);
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('width','1000');svg.setAttribute('height','90');
      const text=document.createElementNS(svg.namespaceURI,'text');
      text.style.whiteSpace='pre';
      for(const [key,value] of Object.entries({x:30,y:60,'font-family':face.family,'font-weight':face.weight,'font-size':32,'font-style':face.italic?'italic':'normal','text-rendering':'geometricPrecision'}))text.setAttribute(key,String(value));
      text.textContent=item.text;svg.append(text);document.querySelector('main').replaceChildren(svg);
      results.push({style,text:text.textContent,run,advance:text.getComputedTextLength(),bounds:(()=>{const b=text.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};})()});
    }
    registry.dispose();registry.dispose();
    if(document.fonts.size!==before) throw new Error('Registry must release its own browser faces');
    return results;
  },faces));
  const containerObservations=await page.evaluate(async fixtures=>{
    const shaper=await fontTest.loadHarfBuzzShaper(),results=[],before=document.fonts.size;
    const bytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
    for(const fixture of fixtures) {
      const entries=[{family:'Reference',data:bytes(fixture.reference)},{family:'Candidate',data:bytes(fixture.data),postscriptName:fixture.postscriptName}]
        .map(entry=>({...entry,weight:fixture.weight,italic:fixture.italic}));
      const registry=await fontTest.loadBrowserFontRegistry(entries,{fontShaper:shaper});
      const style={fontFamily:'Candidate',fontWeight:fixture.weight,italic:fixture.italic};
      const run=registry.shapeText(fixture.expected.text,style);
      const snapshots=[];
      for(const family of ['Reference','Candidate']) {
        const canvas=document.createElement('canvas');canvas.width=850;canvas.height=90;
        const context=canvas.getContext('2d');
        context.textRendering='geometricPrecision';
        context.fontKerning='normal';
        context.font=`${fixture.italic?'italic':'normal'} ${fixture.weight} 32px ${family}`;
        context.fillText(run.text,20,60);
        const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;
        const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',rgba)),b=>b.toString(16).padStart(2,'0')).join('');
        const ink=rgba.some((value,index)=>index%4===3&&value!==0);
        snapshots.push({sha256,ink,advance:context.measureText(run.text).width});
      }
      results.push({format:fixture.format,family:fixture.family,weight:fixture.weight,italic:fixture.italic,postscriptName:fixture.postscriptName,run,snapshots,preparation:registry.fontPreparations[1]});
      registry.dispose();
      if(document.fonts.size!==before)throw new Error('Container registry leaked a FontFace');
    }
    return results;
  },containers);
  await writeFile(new URL('containers.json',output),JSON.stringify(containerObservations,null,2)+'\n');
  for(const [index,result]of containerObservations.entries()) {
    assert.deepEqual(result.run,containers[index].expected);
    assert.ok(result.snapshots.every(snapshot=>snapshot.ink),'An empty canvas cannot prove font equivalence');
    assert.deepEqual(result.snapshots[1],result.snapshots[0],`${result.format}/${result.family}/${result.weight} paints the original selected face`);
    assert.ok(Math.abs(result.snapshots[1].advance-result.run.width*32)<.1,`${result.format}/${result.family}/${result.weight}/${result.italic}: canvas ${result.snapshots[1].advance} vs HarfBuzz ${result.run.width*32}`);
  }
  const report={node:process.version,browser:browser.version(),engine:shaper.engine,contentSecurityPolicy,requests,errors,
    payload:{bundle:bytes.length,bundleGzip:gzipSync(bytes).length,wasm:wasm.length,wasmGzip:gzipSync(wasm).length},
    faces:faces.map(({family,weight,italic,sha256})=>({family,weight,italic,sha256})),observations,containerObservations,
    boundary:'Actual offline module/FontFace load, Node/browser glyph identity, unadjusted SVG advances, compressed/collection canvas pixels compared with original selected faces. Full-slide, variable/CFF matrices, mixed-script/bidi and native acceptance remain pending.'};
  await writeFile(new URL('report.json',output),JSON.stringify(report,null,2)+'\n');
  let index=0;
  for(const face of faces)for(const item of face.cases){
    const result=observations[index++];assert.equal(result.text,item.text);
    if(item.rejected){assert.equal(result.rejected,item.rejected);continue;}
    assert.deepEqual(result.run,item.expected);
    assert.ok(Math.abs(result.advance-item.expected.width*32)<.1,`${face.family}/${face.weight}/${face.italic} ${JSON.stringify(item.text)}: ${result.advance} vs ${item.expected.width*32}`);
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(requests,['https://opf-shaping.test/','https://opf-shaping.test/bundle.js','https://opf-shaping.test/harfbuzz.wasm']);
  // A fresh page cannot borrow the successful page's initialized WASM module.
  const missing=await browser.newPage();
  await missing.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!=='https://opf-shaping.test')return route.abort();
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<script type="module" src="/bundle.js"></script>'});
    if(url.pathname==='/bundle.js')return route.fulfill({contentType:'text/javascript',body:Buffer.from(bytes)});
    return route.fulfill({status:404,body:'Missing local WASM'});
  });
  await missing.goto('https://opf-shaping.test/');
  await missing.waitForFunction(()=>!!globalThis.fontTest);
  const failure=await missing.evaluate(async()=>{
    try{await fontTest.loadHarfBuzzShaper();return {unexpectedSuccess:true};}
    catch(error){return {code:error.code,message:error.message};}
  });
  assert.equal(failure.code,'font-shaper-unavailable');
  await writeFile(new URL('initialization-failure.json',output),JSON.stringify(failure,null,2)+'\n');
  console.log(`Offline HarfBuzz browser: ${observations.length} cases, 33 exact faces, ${containerObservations.length} compressed/selected-face pixel comparisons, identical Node glyphs, advances within 0.1px, owned cleanup and CSP without unsafe-eval passed.`);
} finally {fonts.dispose();await browser.close();}
