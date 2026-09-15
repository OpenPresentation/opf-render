import { copyFile, mkdir, rm, readFile } from "node:fs/promises";
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyFile(new URL("src/index.js", root), new URL("index.js", dist));
await copyFile(new URL("src/index.d.ts", root), new URL("index.d.ts", dist));

for (const name of ["svg.js","svg.d.ts","raster.js","raster-images.js","fonts-browser.js","fonts-browser.d.ts","font-compatibility.js","font-manifest.js","fonts.js","fonts.d.ts","fonts-node.js","fonts-node.d.ts"]) await copyFile(new URL(`src/${name}`,root),new URL(name,dist));

for (const name of ['font-shaping.js','font-shaping.d.ts','font-shaping-browser.js','font-shaping-service.js'])
  await copyFile(new URL(`src/${name}`,root),new URL(name,dist));
// Keep this opt-in runtime out of the existing SVG/font entrypoint bundles.
// Upstream's adjacent WASM lookup remains intact. Its Node-only branch is
// eliminated here; browser hosts never need filesystem or module polyfills.
const require = createRequire(import.meta.url);
const hbEntry = require.resolve('harfbuzzjs');
await build({
  stdin:{contents:"export * from 'harfbuzzjs';",resolveDir:fileURLToPath(root)},
  bundle:true, platform:'browser', format:'esm', target:'es2022',
  define:{process:'undefined'}, external:['module','fs','path','url'],
  minifySyntax:true, outfile:fileURLToPath(new URL('harfbuzz-browser.js',dist)),
  plugins:[{name:'harfbuzz-browser-environment',setup(builder){
    builder.onLoad({filter:/[/\\]harfbuzz\.js$/},async ({path})=>{
      const source=await readFile(path,'utf8');
      const declaration=/var ENVIRONMENT_IS_NODE=[^;]+;/g;
      if([...source.matchAll(declaration)].length!==1) throw new Error('Review the pinned HarfBuzz browser environment adapter.');
      // Compile the fixed browser target, including all uses of its environment
      // flag, so downstream bundlers never try to resolve Node-only imports.
      return {contents:source.replace(declaration,'').replace(/\bENVIRONMENT_IS_NODE\b/g,'false'),loader:'js'};
    });
  }}],
});
await copyFile(require.resolve('harfbuzzjs/dist/harfbuzz.wasm'),new URL('harfbuzz.wasm',dist));
await copyFile(new URL('../LICENSE',pathToFileURL(hbEntry)),new URL('harfbuzzjs-LICENSE',dist));
await copyFile(new URL('src/licenses/HarfBuzz.txt',root),new URL('HarfBuzz-LICENSE',dist));
