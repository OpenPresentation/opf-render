// FF-19: per-character glyph fallback in previews. A scheme's replacement face that lacks glyphs for the
// text's script never fails a preview: each character the face lacks takes the first bundled face that has it
// (Noto Sans for Cyrillic and Greek, then the CJK faces, then the Noto script faces), in measurement and in
// drawing, deterministically, reported as a `font-glyph-fallback` note. Strict faces (`glyphFallback: "none"`)
// still raise `missing-glyph`. Offline and deterministic.
import assert from 'node:assert/strict';
import * as core from '@openpresentation/opf';
import {renderSvg, renderSvgDeck, svgToPng} from '../dist/index.js';
import {prepareNodeFonts} from '../dist/fonts-node.js';
import {createScriptFonts, createScriptTextMeasurement, glyphFallbackFamilies, designatedFamilies} from '../dist/fonts.js';

assert.equal(typeof core.resolveScriptFonts, 'function', 'the linked core exports resolveScriptFonts');
const fonts = await prepareNodeFonts({pack: 'office', substitutionPolicy: 'visual', scripts: 'all'});
const raw = fonts.registry.textMeasurement;

const TEXT = {
  russian: {title: 'Квартальный обзор', body: 'Выручка выросла, а расходы остались прежними'},
  greek: {title: 'Τριμηνιαία ανασκόπηση', body: 'Τα έσοδα αυξήθηκαν ενώ τα έξοδα έμειναν σταθερά'}
};
const deck = (language, fontScheme, title, text) => ({$schema: 'https://openpresentation.org/schema/opf/v1', name: `glyph fallback ${language} ${fontScheme}`, language, design: {fontScheme}, slides: [{id: 'a', title, text}]});
const strictCovers = (family, text, style = {}) => {
  try { raw.measure(text, 20, {fontFamily: family, fontWeight: 400, ...style}); return true; } catch (error) { if (error.code === 'missing-glyph') return false; throw error; }
};
/** [family, text] for every drawn run; a run without its own font-family inherits its text element's. */
const drawnRuns = (svg) => [...svg.matchAll(/<text\b([^>]*)>(.*?)<\/text>/gs)].flatMap(([, attributes, content]) => {
  const inherited = /font-family="([^",]*)/.exec(attributes)[1];
  if (!content.includes('<tspan')) return [[inherited, content]];
  return [...content.matchAll(/<tspan\b([^>]*)>([^<]*)<\/tspan>/g)].map(([, own, text]) => [/font-family="([^",]*)/.exec(own)?.[1] ?? inherited, text]);
});
/** Every planned run must be drawn by a face that has all of its glyphs. */
function assertDrawable(label, document, options = fonts.options) {
  const diagnostics = [];
  const svg = renderSvg(document, {...options, textMeasurement: createScriptTextMeasurement(raw, core.resolveScriptFonts(document)), onDiagnostic: (item) => diagnostics.push(item)});
  for (const [family, text] of drawnRuns(svg)) assert.ok(strictCovers(family, text.replace(/&[a-z]+;/g, ' ')), `${label}: ${family} has every glyph of ${JSON.stringify(text)}`);
  return {svg, diagnostics: diagnostics.filter((item) => item.code === 'font-glyph-fallback')};
}

// 1. Schemes whose face lacks Cyrillic or Greek: Latin-slot text falls back to Noto Sans per character.
const latinGaps = {
  georgia: ['russian', 'greek'], constantia: ['russian', 'greek'], mangal: ['russian', 'greek'], 'arabic-typesetting': ['russian', 'greek'],
  david: ['russian', 'greek'], 'angsana-new': ['russian', 'greek'],
  meiryo: ['greek'], 'yu-gothic': ['greek'], 'microsoft-yahei': ['greek'], 'malgun-gothic': ['greek']
};
let cases = 0;
for (const [scheme, languages] of Object.entries(latinGaps)) {
  for (const language of languages) {
    const label = `${scheme} + ${language}`;
    const document = deck(language, scheme, TEXT[language].title, TEXT[language].body);
    // The exact face named by the scheme cannot show the text (this is what used to fail).
    const face = fonts.registry.resolveFont({fontFamily: core.resolveScriptFonts(document).body.latin, fontWeight: 400}).resolvedFamily;
    assert.ok(!strictCovers(face, TEXT[language].body), `${label}: ${face} lacks glyphs of the text`);
    assert.throws(() => renderSvg(document, {...fonts.options, glyphFallback: 'none', textMeasurement: createScriptTextMeasurement(raw, core.resolveScriptFonts(document), {glyphFallback: 'none'})}), {code: 'missing-glyph'}, `${label}: strict faces still raise missing-glyph`);
    // Preview: renders, draws every glyph with a face that has it, notes the substitution.
    const {svg, diagnostics} = assertDrawable(label, document);
    assert.ok(diagnostics.length > 0 && diagnostics.every((item) => item.fallbackFamily === 'Noto Sans' && item.fontFamily === face && item.path), `${label}: reports the Noto Sans fallback: ${JSON.stringify(diagnostics.map((item) => [item.fontFamily, item.fallbackFamily]))}`);
    assert.ok(drawnRuns(svg).some(([family]) => family === 'Noto Sans'), `${label}: draws with Noto Sans`);
    assert.equal(renderSvg(document, {...fonts.options, textMeasurement: createScriptTextMeasurement(raw, core.resolveScriptFonts(document))}), assertDrawable(label, document).svg, `${label}: deterministic`);
    // Measurement alone (what the PPTX export and pagination use) succeeds with the same wrapper.
    const measurement = createScriptTextMeasurement(raw, core.resolveScriptFonts(document));
    const width = measurement.measure(TEXT[language].body, 25, {fontFamily: face, fontWeight: 400, path: 'slides.0.text'});
    assert.ok(width > 0 && measurement.outlineBounds(TEXT[language].body, 25, {fontFamily: face, fontWeight: 400, path: 'slides.0.text'}).width > 0, `${label}: measures`);
    cases++;
  }
}

// 2. Faces that already cover the script never report a fallback; plain Latin text is untouched.
for (const [scheme, language] of [['calibri', 'russian'], ['calibri', 'greek'], ['roboto', 'greek'], ['times-new-roman', 'russian']]) {
  const {diagnostics} = assertDrawable(`${scheme} + ${language}`, deck(language, scheme, TEXT[language].title, TEXT[language].body));
  assert.deepEqual(diagnostics, [], `${scheme} + ${language}: the scheme's face covers the script`);
}
{
  const document = deck('english', 'georgia', 'Quarterly review', 'Revenue grew 12% with “curly” quotes – and dashes…');
  const {svg, diagnostics} = assertDrawable('georgia + english', document);
  assert.deepEqual(diagnostics, []);
  assert.doesNotMatch(svg, /<tspan/, 'Latin text stays one run');
}

// 3. Mixed text keeps each script in its own face: Latin stays in the scheme's face, Greek moves as whole words.
{
  const document = deck('greek', 'georgia', 'Revenue Τριμηνιαία ανασκόπηση Growth', 'Body');
  const {svg} = assertDrawable('mixed', document);
  const title = drawnRuns(svg).filter(([, text]) => /Revenue|Τριμηνιαία|Growth/.test(text));
  assert.deepEqual(title.map(([family]) => family), ['Gelasio', 'Noto Sans', 'Gelasio'], 'Latin words keep Gelasio; Greek words use Noto Sans');
}

// 4. CJK: one CJK face is chosen per Han run, but a character it lacks takes another CJK face.
{
  // Japanese-only kanji U+53CE beside Hangul in a Latin deck.
  const document = deck('english', 'calibri', 'Revenue 収益 성장', 'Revenue grew');
  assert.throws(() => raw.measure('収', 20, {fontFamily: 'Noto Sans KR', fontWeight: 400}), {code: 'missing-glyph'}, 'the Korean face lacks the kanji');
  const {svg, diagnostics} = assertDrawable('kanji + hangul', document);
  const title = drawnRuns(svg);
  assert.ok(title.some(([family, text]) => family === 'Noto Sans JP' && text.includes('収')), 'the kanji is drawn with the Japanese face');
  assert.ok(title.some(([family, text]) => family === 'Noto Sans KR' && text.includes('성장')), 'the Hangul keeps the Korean face');
  assert.ok(diagnostics.some((item) => item.fallbackFamily === 'Noto Sans JP' && item.characters.includes('収') && item.scripts.includes('Hani')), 'the substitution is reported');
  assert.throws(() => renderSvg(document, {...fonts.options, glyphFallback: 'none', textMeasurement: createScriptTextMeasurement(raw, core.resolveScriptFonts(document), {glyphFallback: 'none'})}), {code: 'missing-glyph'});
  // Simplified-only hanzi U+53D8 in a Japanese deck.
  const japanese = deck('japanese', 'meiryo', '季度回顾 变', '四半期は 变 わった');
  assert.throws(() => raw.measure('变', 20, {fontFamily: 'Noto Sans JP', fontWeight: 400}), {code: 'missing-glyph'}, 'the Japanese face lacks the hanzi');
  const second = assertDrawable('hanzi in japanese', japanese);
  assert.ok(drawnRuns(second.svg).some(([family, text]) => family === 'Noto Sans SC' && text.includes('变')), 'the hanzi is drawn with the Simplified Chinese face');
  assert.ok(drawnRuns(second.svg).some(([family, text]) => family === 'Noto Sans JP' && /^[^变]*$/.test(text)), 'the rest of the line keeps the Japanese face');
  assert.ok(second.diagnostics.every((item) => item.fontFamily === 'Noto Sans JP'));
}

// 5. The chain is defined, deterministic and comes from the designated families.
{
  const japanese = core.resolveScriptFonts(deck('japanese', 'meiryo', 'x', 'y'));
  const latin = core.resolveScriptFonts(deck('english', 'calibri', 'x', 'y'));
  const chain = (character, profile) => glyphFallbackFamilies(character, profile);
  assert.deepEqual(chain('ρ', latin).slice(0, 2), ['Noto Sans', 'Noto Sans JP'], 'Cyrillic and Greek: Noto Sans, then the CJK faces');
  assert.deepEqual(chain('変', japanese).slice(0, 5), ['Noto Sans JP', 'Noto Serif JP', 'Noto Sans', 'Noto Sans SC', 'Noto Serif SC'], 'Han in a Japanese deck: the deck face, Noto Sans, the other CJK faces');
  assert.deepEqual(chain('収', latin).slice(0, 3), ['Noto Sans', 'Noto Sans JP', 'Noto Serif JP'], 'Han in a Latin deck: Noto Sans, then every CJK face');
  assert.deepEqual(chain('ก', latin).slice(0, 2), ['Noto Sans Thai', 'Noto Serif Thai'], 'a script character: its own script face first');
  assert.deepEqual(glyphFallbackFamilies('ρ', latin, true).slice(0, 1), ['Noto Sans']);
  for (const family of chain('ρ', latin)) assert.ok(designatedFamiliesAll().includes(family), `${family} is a designated family`);
  assert.deepEqual(chain('ρ', latin), chain('ρ', latin), 'deterministic');
}
function designatedFamiliesAll() {
  return ['Latn', 'Jpan', 'Hans', 'Hant', 'Kore', 'Arab', 'Hebr', 'Deva', 'Beng', 'Guru', 'Gujr', 'Orya', 'Taml', 'Telu', 'Knda', 'Mlym', 'Sinh', 'Thai', 'Laoo', 'Khmr', 'Mymr', 'Ethi', 'Armn', 'Geor', 'Mong', 'Thaa', 'Syrc', 'Tibt'].flatMap((script) => designatedFamilies(script));
}

// 6. Planner API: notes, options and the unmeasured stack.
{
  const document = deck('greek', 'georgia', TEXT.greek.title, TEXT.greek.body);
  const notes = [];
  const planner = createScriptFonts(core.resolveScriptFonts(document), raw, {onFallback: (note) => notes.push(note)});
  const runs = planner.plan('Τριμηνιαία και Revenue', {fontFamily: 'Gelasio', fontWeight: 400, path: 'slides.0.text'});
  assert.deepEqual(runs.map((run) => [run.family, run.text]), [['Noto Sans', 'Τριμηνιαία και '], ['Gelasio', 'Revenue']]);
  assert.equal(notes.length, 1);
  assert.deepEqual(planner.fallbacks, notes);
  assert.equal(notes[0].path, 'slides.0.text');
  planner.plan('Τριμηνιαία και Revenue', {fontFamily: 'Gelasio', fontWeight: 400, path: 'slides.0.text'});
  assert.equal(notes.length, 1, 'a note is reported once');
  const none = createScriptFonts(core.resolveScriptFonts(document), raw, {glyphFallback: 'none'});
  assert.equal(none.plan('Τριμηνιαία', {fontFamily: 'Gelasio', fontWeight: 400}).every((run) => run.own), true, 'strict faces plan the chosen face');
  // Without a registry the renderer names the fallback in the stack, and the browser picks glyphs.
  const estimated = renderSvg(document);
  assert.match(estimated, /font-family="Georgia, Noto Sans, serif"/);
  assert.doesNotMatch(renderSvg(deck('english', 'georgia', 'Quarterly review', 'Body')), /Noto Sans/);
}

// 7. The raster draws the fallback faces.
{
  const document = deck('greek', 'georgia', 'Τριμηνιαία', 'Revenue');
  const measured = {...fonts.options, textMeasurement: createScriptTextMeasurement(raw, core.resolveScriptFonts(document))};
  const png = await svgToPng(renderSvg(document, measured), {...measured, scale: 0.25});
  assert.deepEqual(png, await svgToPng(renderSvg(document, measured), {...measured, scale: 0.25}), 'deterministic raster');
  const without = await svgToPng(renderSvg(document, measured), {...measured, fontFiles: measured.fontFiles.filter((file) => !/NotoSans_/.test(file)), scale: 0.25});
  assert.notDeepEqual(png, without, 'the raster uses the Noto Sans face');
}

// 8. Without a fallback face loaded, the error is unchanged.
{
  const base = await prepareNodeFonts({pack: 'base'});
  assert.throws(() => renderSvgDeck(deck('japanese', 'roboto', '四半期', 'Body'), base.options), {code: 'missing-glyph'});
}
console.log(`Glyph fallback passed: ${cases} scheme and script cases, CJK Han fallback, strict faces, chain order, notes, estimated stacks and raster.`);
