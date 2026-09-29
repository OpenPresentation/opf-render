// FF-31 (owner policy 2026-09-29): the vendored Intos family is the metric-compatible preview for
// Aptos, Aptos Display, Aptos Narrow and Aptos Serif. It ships inside this package, pinned by upstream
// commit and per-file SHA-256, loads only through the opt-in `aptos` pack, and is embedded in an SVG
// only when the slide names the family. No Aptos file is used here: the width constants below were
// measured once against Aptos 2.01 (aggregate numbers only) and lock the metric-compatibility claim.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {BUNDLED_FONT_MANIFEST, prepareNodeFonts} from '../dist/fonts-node.js';
import {renderSvg, svgToPng} from '../dist/index.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pkg = BUNDLED_FONT_MANIFEST.packages.find(item => item.name === 'intos');

// Manifest: a vendored, hash-pinned OFL-1.1 package with no Reserved Font Name.
assert.ok(pkg && pkg.vendored === true && pkg.pack === 'aptos' && pkg.directory === 'fonts/intos' && pkg.embed === 'used');
assert.equal(pkg.license, 'OFL-1.1');
assert.equal(pkg.reservedFontName, null);
assert.match(pkg.commit, /^[0-9a-f]{40}$/);
assert.equal(pkg.source, `https://github.com/muglug/intos/tree/${pkg.commit}`);
assert.equal(pkg.faces.length, 16);
assert.deepEqual([...new Set(pkg.faces.map(face => face.family))].sort(), ['Intos', 'Intos Display', 'Intos Narrow', 'Intos Serif']);
for (const family of ['Intos', 'Intos Display', 'Intos Narrow', 'Intos Serif']) {
  assert.deepEqual(pkg.faces.filter(face => face.family === family).map(face => `${face.weight}${face.italic ? 'i' : ''}`).sort(), ['400', '400i', '700', '700i'], family);
}
for (const face of pkg.faces) assert.match(face.sha256, /^[0-9a-f]{64}$/);
// No replacement family name is a trademark of the font it replaces (owner rule): none contains "Aptos".
assert.ok(pkg.faces.every(face => !/aptos/i.test(face.family)));

const prepared = await prepareNodeFonts({pack: 'aptos'});
const {registry, options} = prepared;
const vendoredFiles = options.fontFiles.filter(file => path.basename(path.dirname(file)) === 'intos');
assert.equal(vendoredFiles.length, 16);
const license = await readFile(path.join(path.dirname(vendoredFiles[0]), pkg.licenseFile));
assert.equal(hash(license), pkg.licenseSha256);
assert.match(license.toString('utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
assert.doesNotMatch(license.toString('utf8'), /with Reserved Font Name/);
for (const file of vendoredFiles) assert.equal(hash(await readFile(file)), pkg.faces.find(face => face.file === path.basename(file)).sha256, path.basename(file));
const notice = (await readFile(path.join(path.dirname(vendoredFiles[0]), pkg.noticeFile))).toString('utf8');
assert.equal(hash(Buffer.from(notice)), pkg.noticeSha256);
assert.ok(notice.includes(pkg.commit) && notice.includes('Inter Project Authors') && notice.includes('Gelasio Project Authors'));
// Embedded SVG licenses carry the license and the notice.
assert.ok(registry.embeddedFonts.filter(face => /^Intos/.test(face.family)).every(face => face.license.includes('SIL OPEN FONT LICENSE') && face.license.includes('Gelasio Project Authors')));

// The aptos pack is base + office + Intos; the other packs never carry Intos.
assert.equal(registry.embeddedFonts.length, 9 + 24 + 16);
assert.ok(registry.embeddedFonts.every(face => face.embed === 'used'));
for (const pack of ['base', 'office']) assert.ok(!(await prepareNodeFonts({pack})).registry.describeFaces().some(face => /^Intos/.test(face.family)), pack);
assert.equal(registry.textMeasurement.resolveFont({fontFamily: 'Intos', fontWeight: 400}).substitute, false);

// Metric compatibility: the shaped width of one string, in thousandths of the font size, equals the
// width measured in the real Aptos 2.01 faces (bit for bit), in every style the policy claims.
const sample = 'Quarterly operating review: AVATAR affine 2026 fi ffl';
for (const [family, weight, italic, expected] of [
  ['Aptos', 400, false, 21861.328125], ['Aptos', 700, false, 23089.84375], ['Aptos', 400, true, 21726.07421875],
  ['Aptos Display', 700, false, 21892.08984375], ['Aptos Narrow', 400, false, 20163.0859375], ['Aptos Serif', 400, false, 23292.96875],
]) {
  assert.equal(registry.textMeasurement.measure(sample, 1000, {fontFamily: family, fontWeight: weight, italic}), expected, `${family} ${weight}${italic ? 'i' : ''}`);
  const resolved = registry.resolveFont({fontFamily: family, fontWeight: weight, italic});
  assert.deepEqual([resolved.compatibility, resolved.substitute, resolved.resolvedFamily.startsWith('Intos')], ['metric', true, true]);
}
// Real Aptos is never bundled or embedded: the source family stays the requested one.
assert.ok(registry.embeddedFonts.every(face => !/aptos/i.test(face.family)));

// Rendering: the default (Aptos) scheme measures and draws with Intos, and the SVG embeds only the Intos
// families its text names, not the unused Narrow and Serif families.
const deck = {name: 'Aptos preview', slides: [{id: 'a', title: 'Quarterly operating review', text: 'Revenue grew in every region.'}]};
const source = JSON.stringify(deck);
const svg = renderSvg(deck, options);
assert.equal(JSON.stringify(deck), source);
const drawn = [...new Set([...svg.matchAll(/font-family="([^"]+)"/g)].map(match => match[1]))].sort();
assert.deepEqual(drawn, ['Intos Display, sans-serif', 'Intos, sans-serif']);
const embedded = [...svg.matchAll(/@font-face\{font-family:"([^"]+)"/g)].map(match => match[1]);
assert.equal(embedded.filter(family => family === 'Intos').length, 4);
assert.equal(embedded.filter(family => family === 'Intos Display').length, 4);
assert.ok(!embedded.includes('Intos Narrow') && !embedded.includes('Intos Serif'), 'unused Intos families stay out of the SVG');
assert.ok(!embedded.includes('Roboto') && !embedded.includes('Carlito'), 'the aptos pack embeds only the families the slide names');
assert.ok((await prepareNodeFonts({pack: 'office'})).options.embeddedFonts.length === 33 && (await prepareNodeFonts({pack: 'office'})).options.embeddedFonts.every(face => face.embed === undefined), 'other packs embed as before');
assert.equal(renderSvg(deck, (await prepareNodeFonts({pack: 'aptos'})).options), svg, 'same bytes and input replay identically');
// A slide that names none of the Intos families embeds none of them.
const roboto = renderSvg({name: 'Roboto', design: {fontScheme: 'roboto'}, slides: [{id: 'r', title: 'Title', text: 'Body'}]}, options);
assert.ok(!/font-family:"Intos/.test(roboto) && /font-family:"Roboto"/.test(roboto));
// Node raster output draws from the same files.
const png = await svgToPng(svg, {...options, scale: 0.5});
assert.ok(png.byteLength > 1000);
const robotoDeck = {...deck, design: {fontScheme: 'roboto'}};
assert.notDeepEqual(png, await svgToPng(renderSvg(robotoDeck, options), {...options, scale: 0.5}));

// Integrity: a changed or missing vendored file is refused, like every pinned package.
if (existsSync(new URL('../dist/fonts-node.js', import.meta.url))) {
  const root = fileURLToPath(new URL('../', import.meta.url)), temporary = await mkdtemp(path.join(tmpdir(), 'opf-aptos-pack-'));
  try {
    await writeFile(path.join(temporary, 'package.json'), JSON.stringify({type: 'module'}));
    await cp(path.join(root, 'dist'), path.join(temporary, 'dist'), {recursive: true});
    await cp(path.join(root, 'fonts'), path.join(temporary, 'fonts'), {recursive: true});
    await mkdir(path.join(temporary, 'node_modules'), {recursive: true});
    for (const name of ['fontkit', '@openpresentation', '@resvg', '@expo-google-fonts']) await symlink(path.join(root, 'node_modules', name), path.join(temporary, 'node_modules', name), process.platform === 'win32' ? 'junction' : 'dir');
    const isolated = await import(pathToFileURL(path.join(temporary, 'dist/fonts-node.js')));
    await isolated.prepareNodeFonts({pack: 'aptos'});
    const file = path.join(temporary, 'fonts/intos', pkg.faces[0].file), original = await readFile(file);
    await writeFile(file, Buffer.concat([original, Buffer.from('corrupt')]));
    await assert.rejects(isolated.prepareNodeFonts({pack: 'aptos'}), {code: 'font-integrity-mismatch'});
    await writeFile(file, original);
    const licenseFile = path.join(temporary, 'fonts/intos', pkg.licenseFile);
    await writeFile(licenseFile, 'Missing original notice');
    await assert.rejects(isolated.prepareNodeFonts({pack: 'aptos'}), {code: 'font-integrity-mismatch'});
    await writeFile(licenseFile, license);
    await rm(file);
    await assert.rejects(isolated.prepareNodeFonts({pack: 'aptos'}), {code: 'font-resource-unavailable'});
    // The other packs do not read the vendored directory.
    await isolated.prepareNodeFonts({pack: 'office'});
  } finally { await rm(temporary, {recursive: true, force: true}); }
}
console.log(JSON.stringify({test: 'aptos-pack', commit: pkg.commit, faces: pkg.faces.length, embeddedInAptosSlide: embedded.filter(family => /^Intos/.test(family)).length, svgBytes: svg.length}));
