import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {prepareNodeFonts} from '../dist/fonts-node.js';
import {loadHarfBuzzShaper} from '../dist/font-shaping.js';
import {renderSvg} from '../dist/svg.js';

const output=new URL('../artifacts/font-shaping/source-groups-browser/',import.meta.url);await mkdir(output,{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex');
const prepared=await prepareNodeFonts({pack:'office',fontShaper:await loadHarfBuzzShaper()});
const browser=await chromium.launch();
const report={node:process.version,browser:browser.version(),verifierSha256:hash(await readFile(new URL(import.meta.url))),requests:[],errors:[],cases:[]};
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 page.on('pageerror',error=>report.errors.push(error.message));
 await page.route(/^https?:/,route=>{report.requests.push(route.request().url());return route.abort();});
 await page.setContent('<style>body{margin:0}svg{display:block}</style><main></main>');
 for(const mode of ['measured','painted'])for(const [family,parts]of [['Arimo',['A','V']],['Gelasio',['of','fice']],['Arimo',['A','\u0301B']],['Arimo',['אָ','ב']]]){
  const options={...prepared.options,trace:true,...(mode==='measured'?{textPainting:undefined}:{})};
  const runs=parts.map((text,index)=>({text,fontSize:48,color:index%2?'#123456FF':'#123456',underline:true,strikethrough:true}));
  const deck=runs=>({design:{fontScheme:{id:'roboto',heading:{family},body:{family},code:{family}}},slides:[{text:runs}]});
  const pixels=[];let selection;
  for(const [kind,value]of [['single',[{...runs[0],text:parts.join('')}]],['split',runs]]){
   const svg=renderSvg(deck(value),options);
   await page.evaluate(svg=>{document.querySelector('main').innerHTML=svg;},svg);await page.evaluate(()=>document.fonts.ready);
   pixels.push(await page.locator('svg').screenshot());
   selection=await page.evaluate(()=>{const node=document.querySelector('[data-opf-rich-text]');const range=document.createRange();range.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(range);const text=getSelection().toString();getSelection().removeAllRanges();return text;});
   assert.equal(selection,parts.join(''));
   await writeFile(new URL(`${mode}-${family}-${parts.join('').codePointAt(0)}-${kind}.png`,output),pixels.at(-1));
  }
  assert.deepEqual(pixels[1],pixels[0],`${mode}/${family}/${parts.join('')}: splitting source runs changes actual browser ink`);
  report.cases.push({mode,family,parts,sha256:hash(pixels[1]),selection});
 }
 const colors=[{text:'of',color:'#CC2222',fontSize:64,underline:true,link:'https://example.org'},{text:'fice',color:'#2222CC',fontSize:64,strikethrough:true}];
 const document={design:{fontScheme:{id:'roboto',heading:{family:'Gelasio'},body:{family:'Gelasio'},code:{family:'Gelasio'}}},slides:[{text:colors}]};
 const svg=renderSvg(document,{...prepared.options,trace:true});
 await page.evaluate(svg=>{document.querySelector('main').innerHTML=svg;},svg);await page.evaluate(()=>document.fonts.ready);
 const before=await page.locator('svg').screenshot();
 await writeFile(new URL('colored.png',output),before);await writeFile(new URL('colored.svg',output),svg);
 report.colors=await page.evaluate(()=>({clips:document.querySelectorAll('clipPath').length,links:[...document.querySelectorAll('svg a')].map(node=>node.getAttribute('href')),source:document.querySelector('[data-opf-rich-text] text').textContent,maps:document.querySelectorAll('[data-opf-caret-map]').length}));
 assert.ok(report.colors.clips>0);assert.deepEqual(report.colors.links,['https://example.org']);assert.equal(report.colors.source,'office');assert.equal(report.colors.maps,1);
 await page.evaluate(()=>{for(const node of document.querySelectorAll('text'))node.setAttribute('font-family','UnavailableNativeFont');});
 assert.deepEqual(await page.locator('svg').screenshot(),before,'Invisible logical text does not leak native glyphs through colored children');
 assert.deepEqual(report.requests,[]);assert.deepEqual(report.errors,[]);
 report.status='passed';
 console.log('Cross-run browser: eight measured/painted pairs have identical pixels and copy text; colored ligatures, links and decorations retain prepared painting.');
}catch(error){report.status='failed';report.failure=error.stack;throw error;}
finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2)+'\n');await browser.close();prepared.registry.dispose();}
