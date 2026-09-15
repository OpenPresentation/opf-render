import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import * as hb from 'harfbuzzjs';
import {prepareNodeFonts} from '../dist/fonts-node.js';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {createFontRegistry} from '../dist/fonts.js';
import {renderSvgDeck} from '../dist/svg.js';
import {fontFixtures,instanceCases} from './font-variations-fixtures.mjs';
import {paintingDeck} from './font-painting-fixtures.mjs';

const output=new URL('../artifacts/font-shaping/painting-browser/',import.meta.url);await mkdir(output,{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex');
const service=await loadHarfBuzzShaper(),prepared=await prepareNodeFonts({pack:'office',fontShaper:service});
const faces=prepared.registry.embeddedFonts;
const support=faces.find(face=>face.family==='Arimo'&&face.weight===400&&!face.italic);
const fixtures=faces.map(face=>({id:`${face.family}/${face.weight}/${!!face.italic}`,data:Buffer.from(face.dataUrl.split(',')[1],'base64'),italic:face.italic,license:face.license}));
for(const record of (await fontFixtures()).filter(record=>Object.keys(record.axes).length))
  for(const instance of instanceCases(record))fixtures.push({id:`${record.file}/${instance.id}`,data:record.data,italic:record.italic,license:record.license,variations:instance.coordinates});
const bundle=await build({stdin:{contents:"import {loadHarfBuzzShaper} from '@openpresentation/opf-render/font-shaping-browser'; import {loadBrowserFontRegistry} from '@openpresentation/opf-render/fonts-browser'; import {renderSvg,renderSvgDeck,resolvePresentation} from '@openpresentation/opf-render/svg'; globalThis.paintTest={loadHarfBuzzShaper,loadBrowserFontRegistry,renderSvg,renderSvgDeck,resolvePresentation};",resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,platform:'browser',format:'esm',target:'es2022',write:false});
const wasm=await readFile(new URL(import.meta.resolve('@openpresentation/opf-render/harfbuzz.wasm')));
const policy="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; font-src 'self' data:; img-src blob: data:; style-src 'unsafe-inline'";
const report={node:process.version,platform:process.platform,policy,requests:[],errors:[],slides:[],cases:[]};
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined});report.browser=browser.version();
try {
  const page=await browser.newPage({viewport:{width:1280,height:760}});
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());report.requests.push(url.href);
    if(url.origin!=='https://opf-glyph-paint.test')return route.abort();
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':policy},body:'<!doctype html><meta charset="utf-8"><style>body{margin:0}svg{display:block}</style><main></main><script type="module" src="/bundle.js"></script>'});
    if(url.pathname==='/bundle.js')return route.fulfill({contentType:'text/javascript',body:Buffer.from(bundle.outputFiles[0].contents)});
    if(url.pathname==='/harfbuzz.wasm')return route.fulfill({contentType:'application/wasm',body:wasm});
    return route.abort();
  });
  await page.goto('https://opf-glyph-paint.test/');await page.waitForFunction(()=>!!globalThis.paintTest);
  await page.evaluate(async()=>{globalThis.paintService=await paintTest.loadHarfBuzzShaper();});
  const selected=faces.filter(face=>['Arimo','Cousine'].includes(face.family));
  const expected=renderSvgDeck(paintingDeck,{...prepared.options,trace:true,embeddedFonts:selected});
  const actual=await page.evaluate(async({faces,deck})=>{
    const entries=faces.map(face=>({...face,data:Uint8Array.from(atob(face.dataUrl.split(',')[1]),c=>c.charCodeAt(0))}));
    globalThis.deckFonts=await paintTest.loadBrowserFontRegistry(entries,{fontShaper:paintService});
    return paintTest.renderSvgDeck(deck,{textMeasurement:deckFonts.textMeasurement,textPainting:deckFonts.textPainting,embeddedFonts:deckFonts.embeddedFonts,trace:true});
  },{faces:selected,deck:paintingDeck});
  assert.deepEqual(actual,expected,'Browser and Node use identical glyph paths, source ranges and placement');
  for(const [index,svg]of actual.entries()) {
    await page.evaluate(svg=>{document.querySelector('main').innerHTML=svg;},svg);await page.evaluate(()=>document.fonts.ready);
    const before=await page.locator('svg').screenshot();
    await page.evaluate(()=>{for(const text of document.querySelectorAll('svg text'))text.setAttribute('font-family','UnavailableNativeFamily');});
    const withoutNative=await page.locator('svg').screenshot();
    assert.deepEqual(withoutNative,before,'Native text rasterization does not own the visible glyph ink');
    const text=await page.evaluate(()=>{
      const node=document.querySelector('svg text:not([aria-hidden="true"])');
      const range=document.createRange();range.selectNodeContents(node);
      const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
      const result={expected:node.textContent,selected:selection.toString(),role:document.querySelector('svg').getAttribute('role'),logical:[...document.querySelectorAll('text')].every(node=>node.getAttribute('fill-opacity')==='0')};selection.removeAllRanges();return result;
    });
    assert.equal(text.selected,text.expected);assert.equal(text.role,'group');assert.ok(text.logical);
    await writeFile(new URL(`slide-${index+1}.png`,output),before);
    report.slides.push({index,sha256:hash(before),...text});
  }
  report.accessibility=await page.locator('svg').ariaSnapshot();
  await page.evaluate(async()=>{document.querySelector('main').replaceChildren();deckFonts.dispose();delete globalThis.deckFonts;await document.fonts.ready;});
  const texts=['AVATAR office affine','  Keep spaces  ','o\u0302\u0301'];
  for(const fixture of fixtures) {
    const registry=createFontRegistry([{...fixture,family:'Case',weight:400}],{fontShaper:service});
    const blob=new hb.Blob(fixture.data.buffer.slice(fixture.data.byteOffset,fixture.data.byteOffset+fixture.data.byteLength));
    const face=new hb.Face(blob),font=new hb.Font(face);font.setScale(face.upem,face.upem);
    if(fixture.variations)font.setVariations(Object.entries(fixture.variations).map(([tag,value])=>new hb.Variation(tag,value)));
    const references=texts.map(text=>{
      try {registry.shapeText(text,{fontFamily:'Case',fontWeight:400,italic:fixture.italic});}
      catch(error){assert.equal(error.code,'missing-glyph');return {text,rejected:error.code};}
      const buffer=new hb.Buffer();buffer.addText(text);buffer.setLanguage('und');buffer.guessSegmentProperties();hb.shape(font,buffer);
      const positions=buffer.getGlyphPositions();
      return {text,unitsPerEm:face.upem,glyphs:buffer.getGlyphInfos().map((info,index)=>({id:info.codepoint,cluster:info.cluster,path:font.glyphToPath(info.codepoint),...positions[index]}))};
    });
    registry.dispose();
    const input={id:fixture.id,data:fixture.data.toString('base64'),italic:fixture.italic,license:fixture.license,variations:fixture.variations,references,support};
    assert.ok(Buffer.byteLength(JSON.stringify(input))<8*1024*1024);
    const rows=await page.evaluate(async input=>{
      const decode=base64=>Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
      const baseline=document.fonts.size;
      const registry=await paintTest.loadBrowserFontRegistry([
        {data:decode(input.data),family:'Case',weight:400,italic:input.italic,license:input.license,variations:input.variations},
        {data:decode(input.support.dataUrl.split(',')[1]),family:'Support',weight:400,license:input.support.license},
      ],{fontShaper:paintService});
      const options={textMeasurement:registry.textMeasurement,textPainting:registry.textPainting,embeddedFonts:registry.embeddedFonts,trace:true};
      const rows=[];
      try {for(const reference of input.references) {
        if(reference.rejected) {
          let rejected;try{registry.textPainting.shape(reference.text,{fontFamily:'Case',italic:input.italic});}catch(error){rejected=error.code;}
          rows.push({text:reference.text,rejected});continue;
        }
        const deck={design:{fontScheme:{id:'roboto',heading:{family:'Support'},body:{family:'Support'},code:{family:'Support'}}},slides:[{text:[{text:reference.text,fontFamily:'Case',italic:input.italic,fontSize:24,color:'#123456'}]}]};
        const before=JSON.stringify(deck),bound=paintTest.resolvePresentation(deck,options).slides[0];
        const fit=bound.geometry.items[0].text,fragment=fit.richLines[0].fragments[0],line=fit.placement.lines[0];
        const svg=paintTest.renderSvg(deck,options);document.querySelector('main').innerHTML=svg;
        const target=document.querySelector('[data-opf-rich-text="true"]');
        const isolated=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">${new XMLSerializer().serializeToString(target)}</svg>`;
        const image=new Image(),url=URL.createObjectURL(new Blob([isolated],{type:'image/svg+xml'}));
        const actual=document.createElement('canvas');actual.width=1280;actual.height=720;
        try {image.src=url;await image.decode();actual.getContext('2d').drawImage(image,0,0);}finally{URL.revokeObjectURL(url);}
        const expected=document.createElement('canvas');expected.width=1280;expected.height=720;
        const ctx=expected.getContext('2d');ctx.fillStyle='#123456';
        ctx.translate(line.x+fragment.x,line.baseline+fragment.baselineShift);ctx.scale(fragment.fontSize/reference.unitsPerEm,-fragment.fontSize/reference.unitsPerEm);
        let x=0,y=0;
        for(const glyph of reference.glyphs) {ctx.save();ctx.translate(x+glyph.xOffset,y+glyph.yOffset);ctx.fill(new Path2D(glyph.path));ctx.restore();x+=glyph.xAdvance;y+=glyph.yAdvance;}
        const a=actual.getContext('2d').getImageData(0,0,1280,720).data,b=expected.getContext('2d').getImageData(0,0,1280,720).data;
        let maxAlphaDifference=0,differingPixels=0,ink=0;
        for(let i=3;i<a.length;i+=4){if(a[i])ink++;const delta=Math.abs(a[i]-b[i]);if(delta)differingPixels++;maxAlphaDifference=Math.max(maxAlphaDifference,delta);}
        const paths=[...target.querySelectorAll('path[data-opf-glyph-id]')];
        rows.push({text:reference.text,ink,maxAlphaDifference,differingPixels,glyphs:paths.map(node=>Number(node.dataset.opfGlyphId)),expectedGlyphs:reference.glyphs.map(g=>g.id),sourceUnchanged:JSON.stringify(deck)===before,
          logicalText:[...target.querySelectorAll('text')].map(node=>node.textContent).join(''),width:fit.richLines[0].width,expectedWidth:x/reference.unitsPerEm*fragment.fontSize});
      }}finally{document.querySelector('main').replaceChildren();registry.dispose();await document.fonts.ready;}
      if(document.fonts.size!==baseline)throw new Error('Shaped painting leaked browser font faces');
      return rows;
    },input);
    report.cases.push(...rows.map(row=>({id:fixture.id,sourceSha256:hash(fixture.data),...row})));
  }
}catch(error){report.failure=error.stack;throw error;}
finally{await browser.close();prepared.registry.dispose();await writeFile(new URL('report.json',output),JSON.stringify(report,null,2)+'\n');}
assert.deepEqual(report.errors,[]);
assert.deepEqual(report.requests,['https://opf-glyph-paint.test/','https://opf-glyph-paint.test/bundle.js','https://opf-glyph-paint.test/harfbuzz.wasm']);
assert.equal(report.cases.length,663);
for(const row of report.cases) {
  if(row.rejected){assert.equal(row.rejected,'missing-glyph');continue;}
  assert.ok(row.ink>0);assert.deepEqual(row.glyphs,row.expectedGlyphs);assert.ok(row.sourceUnchanged);assert.equal(row.logicalText,row.text);assert.equal(row.width,row.expectedWidth);
  assert.equal(row.maxAlphaDifference,0,`${row.id}/${row.text}: SVG and independently positioned glyph ink`);
}
console.log(`Shaped SVG browser: ${report.slides.length} selected-text/native-font-independent slides and ${report.cases.length} original-face glyph-run cases.`);
