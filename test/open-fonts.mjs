// FF-31: the open families that OPF font schemes select (Open Sans, Montserrat, Poppins, PT Serif,
// Raleway, Playfair Display, Bebas Neue, Lora, Merriweather Sans, Source Sans Pro) draw with their own
// pinned faces in the office pack, so a strict registry no longer throws for them.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fontSchemes} from '@openpresentation/opf/catalogs';
import {renderSvg, svgToPng} from '../dist/index.js';
import {BUNDLED_FONT_MANIFEST, loadBundledFontRegistry, loadOfficeFontRegistry, prepareNodeFonts} from '../dist/fonts-node.js';
import {fontPolicyFor} from '../dist/fonts.js';

const OPEN = ['Open Sans', 'Montserrat', 'Poppins', 'PT Serif', 'Raleway', 'Playfair Display', 'Bebas Neue', 'Lora', 'Merriweather Sans', 'Source Sans Pro'];
const ALLOWED = ['OFL-1.1', 'Apache-2.0', 'MIT', 'UFL-1.0'];
const open = BUNDLED_FONT_MANIFEST.packages.filter(item => item.pack === 'open');

// Manifest: pinned, hash-verified, license read from the shipped notice, Reserved Font Names recorded.
assert.equal(open.length, 10);
assert.equal(open.reduce((total, item) => total + item.faces.length, 0), 38);
for (const item of BUNDLED_FONT_MANIFEST.packages) {
  assert.ok(ALLOWED.includes(item.license), `${item.name}: ${item.license}`);
  assert.equal(typeof item.hasReservedFontName, 'boolean', item.name);
  assert.ok(Array.isArray(item.reservedFontNames) && item.hasReservedFontName === item.reservedFontNames.length > 0, item.name);
}
const require = (await import('node:module')).createRequire(import.meta.url);
for (const item of open) {
  assert.match(item.version, /^\d+\.\d+\.\d+$/);
  assert.equal(item.source, `https://www.npmjs.com/package/${item.name}/v/${item.version}`);
  const directory = path.dirname(require.resolve(`${item.name}/package.json`));
  const notice = await readFile(path.join(directory, item.licenseFile), 'utf8');
  assert.match(notice, /SIL Open Font License,? Version 1\.1/i, `${item.name} ships the OFL 1.1 notice`);
  assert.equal(createHash('sha256').update(notice).digest('hex'), item.licenseSha256, item.name);
  for (const name of item.reservedFontNames) assert.ok(notice.split(/^-{20,}/m)[0].includes(name), `${item.name}: Reserved Font Name ${name} is declared in the notice`);
  if (item.hasReservedFontName === false) assert.doesNotMatch(notice.split(/^-{20,}/m)[0], /Reserved Font Name/i, `${item.name} declares no Reserved Font Name`);
}
assert.deepEqual(open.find(item => item.name === 'source-sans-pro').reservedFontNames, ['Source']);
assert.deepEqual(open.find(item => item.name === '@expo-google-fonts/pt-serif').reservedFontNames, ['PT Sans', 'PT Serif', 'ParaType']);
assert.equal(open.find(item => item.name === '@expo-google-fonts/open-sans').hasReservedFontName, false);
assert.deepEqual(OPEN.filter(family => !open.some(item => item.faces.some(face => face.family === family))), []);

// Every open family a font scheme selects (core catalog plus the four gallery-only legacy schemes) has a
// policy row that says open, and resolves to its own exact face in a strict office registry.
const strict = await loadOfficeFontRegistry();
const selected = new Set(['Playfair Display', 'Source Sans Pro', 'Montserrat', 'Open Sans', 'Bebas Neue', 'Roboto', 'Lora', 'Merriweather Sans']);
for (const record of fontSchemes.records ?? fontSchemes) for (const family of [record.major, record.minor]) if (fontPolicyFor(family)?.licenseClass === 'open' && !/^Noto /.test(family)) selected.add(family);
for (const family of OPEN) assert.ok(selected.has(family), `${family} is selected by a font scheme`);
for (const family of selected) {
  assert.equal(fontPolicyFor(family).licenseClass, 'open', family);
  for (const fontWeight of [400, 700]) for (const italic of [false, true]) {
    // Bebas Neue has no italic (like Roboto Mono): strict lookup says so instead of slanting the upright face.
    if (family === 'Bebas Neue' && italic) { assert.throws(() => strict.resolveFont({fontFamily: family, fontWeight, italic}), {code: 'font-style-unavailable'}); continue; }
    const resolved = strict.resolveFont({fontFamily: family, fontWeight, italic});
    assert.equal(resolved.resolvedFamily, family, `${family} ${fontWeight}`);
    assert.equal(resolved.substitute, false, family);
    if (family === 'Bebas Neue' && fontWeight === 700) { assert.equal(resolved.compatibility, 'visual', 'Bebas Neue ships one regular weight'); continue; }
    assert.equal(resolved.compatibility, 'exact', `${family} ${fontWeight} ${italic}`);
    assert.ok(strict.textMeasurement.measure('Quarterly operating review 1234', 25, {fontFamily: family, fontWeight, italic}) > 100, family);
  }
}
assert.deepEqual(strict.substitutions.map(entry => entry.requestedFamily).filter(family => family !== 'Bebas Neue'), []);

// Policy-named weights: Arial Black previews with the Montserrat Black face.
const visual = await loadOfficeFontRegistry({substitutionPolicy: 'visual'});
const black = visual.resolveFont({fontFamily: 'Arial Black', fontWeight: 400});
assert.deepEqual([black.resolvedFamily, black.resolvedWeight, black.compatibility], ['Montserrat Black', 900, 'visual']);
assert.equal(visual.resolveFont({fontFamily: 'Montserrat', fontWeight: 900}).resolvedFamily, 'Montserrat Black');
assert.equal(visual.resolveFont({fontFamily: 'Verdana', fontWeight: 400}).resolvedFamily, 'Montserrat');
assert.equal(visual.resolveFont({fontFamily: 'Book Antiqua', fontWeight: 400}).resolvedFamily, 'PT Serif');
assert.equal(visual.resolveFont({fontFamily: 'Bodoni MT', fontWeight: 400}).resolvedFamily, 'Playfair Display');

// Packs stay separate: the base pack still has only Roboto and points at the office pack; the office
// pack can leave the open families out.
const base = await loadBundledFontRegistry();
assert.equal(base.describeFaces().length, 9);
assert.throws(() => base.resolveFont({fontFamily: 'Open Sans', fontWeight: 400}), error => error.code === 'font-unavailable' && error.details.pack === 'office');
const without = await loadOfficeFontRegistry({includeOpenFonts: false});
assert.equal(without.describeFaces().length, 33);
assert.throws(() => without.resolveFont({fontFamily: 'Montserrat', fontWeight: 400}), {code: 'font-unavailable'});

// SVG stays as small as before: open faces are read from fontFiles, embedded only on request.
const defaults = await prepareNodeFonts({pack: 'office'});
assert.equal(defaults.options.embeddedFonts.length, 33);
assert.equal(defaults.options.fontFiles.length, 71);
const embedded = await prepareNodeFonts({pack: 'office', embedOpenFonts: true});
assert.equal(embedded.options.embeddedFonts.length, 71);
assert.equal((await prepareNodeFonts({pack: 'base'})).options.embeddedFonts.length, 9);

// Render a deck in each family to PNG: the family's own face paints (not the sans-serif fallback), and
// each family paints differently from the others.
const hashes = new Map();
for (const family of OPEN) {
  const deck = {design: {theme: 'bare', fontScheme: 'roboto'}, slides: [{title: 'Quarterly review', text: 'Revenue grew in every region.'}]};
  const scheme = {$schema: 'https://openpresentation.org/schema/opf-font-scheme/v1', id: 'x-open', name: family, app: 'Google Slides', languageFamily: 'latin', languages: [], major: family, minor: family, textSample: 'x', type: 'sans-serif'};
  const document = {...deck, design: {fontScheme: 'x-open'}, catalogs: {fontSchemes: {records: [scheme]}}};
  const svg = renderSvg(document, defaults.options);
  assert.ok(svg.includes(`font-family="${family}, sans-serif"`), `${family} is named in the SVG`);
  const png = await svgToPng(svg, {...defaults.options, scale: 0.5});
  const fallback = await svgToPng(svg, {fontFiles: [], useBundledFonts: false, loadSystemFonts: false, scale: 0.5});
  const digest = createHash('sha256').update(png).digest('hex');
  assert.notEqual(digest, createHash('sha256').update(fallback).digest('hex'), `${family} paints with its own face`);
  assert.ok(!hashes.has(digest), `${family} differs from ${hashes.get(digest)}`);
  hashes.set(digest, family);
}
console.log('Open families passed: 10 families and 38 pinned faces resolve exact in the office pack, notices and Reserved Font Names verified, strict mode does not throw, PNG paints each family with its own face.');
