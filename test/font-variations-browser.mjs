import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {fontFixtures,instanceCases,containersFor} from './font-variations-fixtures.mjs';
const records=await fontFixtures(),node=JSON.parse(await readFile('artifacts/font-shaping/variations.json'));
const expected=new Map(node.cases.map(item=>[JSON.stringify([item.file,item.format,item.id,item.backend]),item]));
const bundle=await build({stdin:{contents:"import {loadHarfBuzzShaper} from '@openpresentation/opf-render/font-shaping-browser'; import {loadBrowserFontRegistry} from '@openpresentation/opf-render/fonts-browser'; import {renderSvg} from '@openpresentation/opf-render/svg'; globalThis.fontTest={loadHarfBuzzShaper,loadBrowserFontRegistry,renderSvg};",resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,platform:'browser',format:'esm',target:'es2022',write:false});
const wasm=await readFile(new URL(import.meta.resolve('@openpresentation/opf-render/harfbuzz.wasm'))),requests=[],errors=[],observations=[];
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined});
const policy="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; font-src 'self' data:; style-src 'unsafe-inline'";
try{
  const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());requests.push(url.href);
    if(url.origin!=='https://opf-variations.test')return route.abort();
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':policy},body:'<!doctype html><meta charset="utf-8"><main></main><script type="module" src="/bundle.js"></script>'});
    if(url.pathname==='/bundle.js')return route.fulfill({contentType:'text/javascript',body:Buffer.from(bundle.outputFiles[0].contents)});
    if(url.pathname==='/harfbuzz.wasm')return route.fulfill({contentType:'application/wasm',body:wasm});
    return route.abort();
  });
  await page.goto('https://opf-variations.test/');await page.waitForFunction(()=>!!globalThis.fontTest);
  await page.evaluate(async()=>{globalThis.preparedShaper=await fontTest.loadHarfBuzzShaper();});
  let maxTransfer=0;
  for(const record of records){
    const cases=instanceCases(record);
    for(const [index,container]of (await containersFor(record)).entries()){
      const selected=index===0?cases:cases.filter(item=>['default','maximum','interior'].includes(item.id)||item===cases[1]);
      const fixtures=selected.flatMap(item=>['fontkit','harfbuzz'].map(backend=>({...item,backend,expected:expected.get(JSON.stringify([record.file,container.format,item.id,backend]))})));
      const input={file:record.file,reference:record.data.toString('base64'),data:container.data.toString('base64'),format:container.format,postscriptName:container.postscriptName,italic:record.italic,license:record.license,fixtures};
      const transfer=Buffer.byteLength(JSON.stringify(input));assert.ok(transfer<=8*1024*1024,'Bound each fixture transfer');maxTransfer=Math.max(maxTransfer,transfer);
      observations.push(...await page.evaluate(async input=>{
        const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0)),source=decode(input.reference),data=decode(input.data),out=[];
        const baseline=document.fonts.size;
        for(const item of input.fixtures){
          const settings=Object.entries(item.coordinates).map(([tag,value])=>`"${tag}" ${value}`).join(', ');
          const reference=new FontFace('Reference',source,{weight:'400',style:input.italic?'italic':'normal',...(settings?{variationSettings:settings}:{})});await reference.load();document.fonts.add(reference);
          const registry=await fontTest.loadBrowserFontRegistry([{data,family:'Candidate',italic:input.italic,license:input.license,postscriptName:input.postscriptName,...(item.variations!==undefined?{variations:item.variations}:{})}],item.backend==='harfbuzz'?{fontShaper:globalThis.preparedShaper}:{});
          const descriptor=registry.embeddedFonts[0],serialized=fontTest.renderSvg({slides:[{title:'Font CSS verification'}]},{embeddedFonts:[{...descriptor,family:'CssCandidate'}]});
          const documentSvg=new DOMParser().parseFromString(serialized,'image/svg+xml');
          if(documentSvg.querySelector('parsererror'))throw new Error('Invalid embedded font SVG');
          const svg=documentSvg.documentElement;
          for(const child of [...svg.children])if(!['style','metadata'].includes(child.localName))child.remove();
          const text=documentSvg.createElementNS(svg.namespaceURI,'text');text.textContent=item.expected.observations[0].text;
          for(const [name,value]of Object.entries({'font-family':'CssCandidate','font-weight':400,'font-style':input.italic?'italic':'normal','font-size':32,'text-rendering':'geometricPrecision'}))text.setAttribute(name,String(value));
          text.style.whiteSpace='pre';svg.append(text);document.querySelector('main').replaceChildren(document.importNode(svg,true));
          await document.fonts.load(`${input.italic?'italic':'normal'} 400 32px CssCandidate`);
          const actualText=document.querySelector('main text');
          const metadata=documentSvg.querySelector('metadata[data-opf-font-sources="1"]');
          if(settings){
            const values=JSON.parse(metadata.textContent);
            if(values.length!==1||JSON.stringify(values[0].variations)!==JSON.stringify(descriptor.variations)||values[0].license!==input.license||values[0].namedInstance!==descriptor.namedInstance)throw new Error('SVG loses selected instance metadata');
          }
          const snapshots=[];
          for(const family of ['Reference','Candidate','CssCandidate']){
            const canvas=document.createElement('canvas');canvas.width=1100;canvas.height=120;const ctx=canvas.getContext('2d');ctx.textRendering='geometricPrecision';ctx.fontKerning='normal';ctx.font=`${input.italic?'italic':'normal'} 400 32px ${family}`;ctx.fillText(actualText.textContent,35,80);
            const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
            snapshots.push({ink:pixels.some((v,i)=>i%4===3&&v!==0),advance:ctx.measureText(actualText.textContent).width,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels)),v=>v.toString(16).padStart(2,'0')).join('')});
          }
          const style={fontFamily:'Candidate',italic:input.italic},measured=registry.textMeasurement.measure(actualText.textContent,32,style);
          out.push({file:input.file,format:input.format,id:item.id,backend:item.backend,coordinates:item.coordinates,measured,expected:item.expected.observations[0].width,svgAdvance:actualText.getComputedTextLength(),snapshots});
          registry.dispose();document.fonts.delete(reference);document.querySelector('main').replaceChildren();await document.fonts.ready;
          if(document.fonts.size!==baseline)throw new Error('Variable face cleanup did not restore the baseline');
        }
        return out;
      },input));
    }
  }
  await mkdir('artifacts/font-shaping',{recursive:true});
  await writeFile('artifacts/font-shaping/variations-browser.json',JSON.stringify({node:process.version,browser:browser.version(),policy,requests,errors,maxTransfer,observations},null,2)+'\n');
  for(const row of observations){
    assert.equal(row.measured,row.expected);
    assert.ok(row.snapshots.every(snapshot=>snapshot.ink),'Require real glyph pixels');
    assert.deepEqual(row.snapshots[1],row.snapshots[0],`${row.file}/${row.format}/${row.id}/${row.backend}: FontFace instance`);
    assert.deepEqual(row.snapshots[2],row.snapshots[0],`${row.file}/${row.format}/${row.id}/${row.backend}: SVG CSS instance`);
    assert.ok(Math.abs(row.measured-row.snapshots[0].advance)<.1,`${row.file}/${row.format}/${row.id}/${row.backend}: measured ${row.measured} browser ${row.snapshots[0].advance}`);
    assert.ok(Math.abs(row.svgAdvance-row.snapshots[0].advance)<.1,'Actual SVG and canvas agree');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,['https://opf-variations.test/','https://opf-variations.test/bundle.js','https://opf-variations.test/harfbuzz.wasm']);
  console.log(`CFF/variable browser: ${observations.length} cases preserve selected nonempty pixels through FontFace and SVG CSS, source instance metadata, Node metrics, CSP and owned cleanup.`);
}finally{await browser.close();}
