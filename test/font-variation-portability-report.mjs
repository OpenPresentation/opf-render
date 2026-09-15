/** Compare the same source fonts and instances across retained native probes. */
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fontFixtures, instanceCases, sha256} from './font-variations-fixtures.mjs';

const [destination, ...roots] = process.argv.slice(2);
assert.ok(destination && roots.length >= 2,
  'Usage: node test/font-variation-portability-report.mjs output.json font-shaping-artifacts-dir ...');
const fixtures = (await fontFixtures()).filter(record => Object.keys(record.axes).length);
const expected = new Map(fixtures.flatMap(record => instanceCases(record).map(instance => [
  JSON.stringify([record.file, instance.id]),
  {...instance, outline: record.outline, sourceSha256: sha256(record.data)},
])));
const key = row => JSON.stringify([row.file, row.id]);
const sampleKey = sample => JSON.stringify([sample.kerning, sample.size, sample.count]);
const sources = [];
for (const root of roots) {
  const read = async relative => {
    const bytes = await readFile(path.join(root, relative));
    return {sha256: sha256(bytes), value: JSON.parse(bytes)};
  };
  const paint = await read('variation-paint/report.json');
  const metrics = await read('variation-metrics/native-probe.json');
  assert.equal(paint.value.channel, 'pinned-chromium');
  assert.equal(metrics.value.channel, 'pinned-chromium');
  assert.equal(paint.value.platform, metrics.value.platform);
  assert.equal(paint.value.browser, metrics.value.browser);
  assert.equal(paint.value.harfbuzz, metrics.value.harfbuzz);
  assert.equal(paint.value.node, metrics.value.node);
  assert.match(paint.value.node, /^v24\./);
  assert.deepEqual(paint.value.errors, []);
  assert.deepEqual(paint.value.requests, []);
  assert.equal(paint.value.cases.length, expected.size * 3);
  assert.equal(metrics.value.cases.length, expected.size);
  const glyphs = new Map(), advances = new Map();
  for (const row of paint.value.cases) {
    const reference = expected.get(key(row));
    assert.ok(reference, `Unexpected paint instance: ${key(row)}`);
    assert.equal(row.sourceSha256, reference.sourceSha256);
    assert.equal(row.outline, reference.outline);
    assert.deepEqual(row.coordinates, reference.coordinates);
    assert.ok('HgW'.includes(row.text) && row.text.length === 1);
    const glyphKey = JSON.stringify([row.file, row.id, row.text]);
    assert.ok(!glyphs.has(glyphKey), `Duplicate paint case: ${glyphKey}`);
    glyphs.set(glyphKey, row);
    assert.ok([row.nativeAdvance, row.harfbuzzAdvance, row.selectedDifference].every(Number.isFinite));
    assert.deepEqual(row.controls.map(control => control.id), ['default', 'minimum', 'maximum']);
    assert.ok([row.selectedDifference, ...row.controls.map(control => control.difference)]
      .every(value => Number.isFinite(value) && value >= 0 && value <= 1));
    assert.ok([row.nativeBounds, row.outlineBounds].every(bounds => bounds &&
      bounds.x > 0 && bounds.y > 0 && bounds.width > 0 && bounds.height > 0 &&
      bounds.x + bounds.width < 440 && bounds.y + bounds.height < 440), 'Require uncropped ink');
  }
  for (const row of metrics.value.cases) {
    const reference = expected.get(key(row));
    assert.ok(reference, `Unexpected metric instance: ${key(row)}`);
    assert.ok(!advances.has(key(row)), `Duplicate metric case: ${key(row)}`);
    assert.equal(row.outline, reference.outline);
    assert.deepEqual(row.coordinates, reference.coordinates);
    assert.ok(Number.isInteger(row.unitsPerEm) && row.unitsPerEm > 0);
    assert.ok([row.registryAdvance, row.harfbuzzAdvance].every(Number.isFinite));
    assert.equal(row.glyphId, glyphs.get(JSON.stringify([row.file, row.id, 'H'])).glyphId);
    assert.equal(row.measurements.length, 12);
    const samples = new Map(row.measurements.map(sample => [sampleKey(sample), sample]));
    assert.equal(samples.size, 12);
    for (const kerning of ['none', 'normal']) for (const size of [12, 32, 72]) for (const count of [1, 128]) {
      const sample = samples.get(sampleKey({kerning, size, count}));
      assert.ok(sample && Number.isFinite(sample.width) && sample.width > 0);
    }
    advances.set(key(row), {...row, samples});
  }
  sources.push({platform: paint.value.platform, browser: paint.value.browser,
    node: paint.value.node, harfbuzz: paint.value.harfbuzz,
    reportHashes: {paint: paint.sha256, metrics: metrics.sha256}, glyphs, advances});
}
assert.equal(new Set(sources.map(source => source.platform)).size, sources.length, 'Use distinct platforms');
assert.equal(new Set(sources.map(source => source.browser)).size, 1, 'Compare the same Chromium version');
assert.equal(new Set(sources.map(source => source.harfbuzz)).size, 1, 'Compare the same HarfBuzz version');

// The existing browser gate is strictly below 0.1px. If two native targets
// differ by >= 0.2px, no single width can satisfy that gate for both targets.
// Report this incompatibility; do not alter the gate or correct a shaped run.
const nativeAdvanceGatePx = 0.1;
const comparisons = [];
for (let a = 0; a < sources.length; a++) for (let b = a + 1; b < sources.length; b++) {
  const left = sources[a], right = sources[b], rows = [];
  for (const [instanceKey, row] of left.advances) {
    const other = right.advances.get(instanceKey);
    assert.ok(other);
    assert.equal(row.unitsPerEm, other.unitsPerEm);
    assert.equal(row.glyphId, other.glyphId);
    assert.equal(row.harfbuzzAdvance, other.harfbuzzAdvance);
    assert.equal(row.registryAdvance, other.registryAdvance);
    for (const [id, sample] of row.samples) {
      const width = other.samples.get(id).width;
      const gap = Math.abs(sample.width - width);
      rows.push({file: row.file, id: row.id, outline: row.outline, coordinates: row.coordinates,
        kerning: sample.kerning, size: sample.size, count: sample.count,
        leftWidth: sample.width, rightWidth: width, nativeGapPx: gap,
        minimumCommonErrorPx: gap / 2});
    }
  }
  comparisons.push({platforms: [left.platform, right.platform], summary: Object.fromEntries(
    ['CFF2', 'glyf'].map(outline => {
      const cases = rows.filter(row => row.outline === outline);
      return [outline, {samples: cases.length,
        incompatibleWithCommonWidth: cases.filter(row => row.nativeGapPx >= 2 * nativeAdvanceGatePx).length,
        maxNativeGapPx: Math.max(...cases.map(row => row.nativeGapPx)),
        minimumWorstCommonErrorPx: Math.max(...cases.map(row => row.minimumCommonErrorPx)),
        worst: [...cases].sort((a, b) => b.nativeGapPx - a.nativeGapPx).slice(0, 10)}];
    })), rows});
}
const report = {kind: 'diagnostic-not-acceptance', node: process.version, nativeAdvanceGatePx,
  scope: 'Original source-font H advances at 12/32/72px, 1/128 repetitions and both kerning modes; HgW painting at 256px.',
  sources: sources.map(({glyphs, advances, ...source}) => ({...source,
    summary: Object.fromEntries(['CFF2', 'glyf'].map(outline => {
      const glyphRows = [...glyphs.values()].filter(row => row.outline === outline);
      const metricRows = [...advances.values()].filter(row => row.outline === outline);
      const samples = metricRows.flatMap(row => row.measurements.map(sample => ({row, sample})));
      return [outline, {paintCases: glyphRows.length,
        nativeAdvancesAreWholePixels: glyphRows.filter(row => Number.isInteger(row.nativeAdvance)).length,
        nativeAdvancesEqualRoundedHarfBuzz: glyphRows.filter(row => row.nativeAdvance === Math.round(row.harfbuzzAdvance)).length,
        strictlyCloserWrongControls: glyphRows.filter(row => row.controls.some(control => control.difference < row.selectedDifference)).length,
        maxSelectedPaintDifference: Math.max(...glyphRows.map(row => row.selectedDifference)),
        metricSamples: samples.length,
        nativeWidthsEqualPerGlyphPixelRounding: samples.filter(({row, sample}) =>
          sample.width === Math.round(row.harfbuzzAdvance / row.unitsPerEm * sample.size) * sample.count).length,
        nativeWidthsEqualPerGlyph26_6ThenPixelRounding: samples.filter(({row, sample}) =>
          sample.width === Math.round(Math.round(row.harfbuzzAdvance / row.unitsPerEm * sample.size * 64) / 64) * sample.count).length}];
    }))})), comparisons};
await mkdir(path.dirname(path.resolve(destination)), {recursive: true});
await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({sources: report.sources, comparisons: comparisons.map(({rows, ...summary}) => summary)}));
