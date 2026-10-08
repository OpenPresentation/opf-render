import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// The fixture and the decks below name gallery records (the forest-green and cool-horizon colour schemes, the classic theme), so
// they render with the host catalog registered (./catalog-harness.mjs).
import { defaultCatalog, renderSlideSvg } from './catalog-harness.mjs';

const fixture = JSON.parse(
  readFileSync(new URL('fixtures/color-references.opf.json', import.meta.url), 'utf8'),
);
const forest = defaultCatalog.colorSchemes['forest-green'];
assert.ok(forest, 'forest-green color scheme');

const svgDeck = fixture.slides.slice(0, 3).map((_, index) =>
  renderSlideSvg(fixture, index),
);

const [namedRuns, variableRuns, styledCells] = svgDeck;

assert.match(namedRuns, new RegExp(`fill="${forest.accent2.toUpperCase()}"`, 'i'));
assert.match(namedRuns, new RegExp(`fill="${forest.dark2.toUpperCase()}"`, 'i'));

const risk = fixture.variables.risk.value.toUpperCase();
const highlight = fixture.variables.highlight.toUpperCase();
assert.match(variableRuns, new RegExp(`fill="${risk}"`));
assert.match(variableRuns, new RegExp(`fill="${highlight}"`));
assert.match(variableRuns, /fill="#0F172A"/);

const authoredHex = renderSlideSvg({
  design: { theme: 'classic', colorScheme: 'cool-horizon' },
  slides: [{
    text: [{ text: 'Toolbar', color: '#2563eb' }],
  }],
}, 0);
assert.ok(/<tspan(?=[^>]*fill="#2563eb")[^>]*>Toolbar<\/tspan>/.test(authoredHex));
assert.doesNotMatch(authoredHex, /fill="#2563EB"/);

assert.match(styledCells, new RegExp(`fill="${forest.light2.toUpperCase()}"`, 'i'));
assert.match(styledCells, new RegExp(`fill="${risk}"`));
assert.match(styledCells, new RegExp(`stroke="${forest.accent1.toUpperCase()}"`, 'i'));
assert.match(styledCells, new RegExp(`fill="${forest.accent3.toUpperCase()}"`, 'i'));

const invalidFallback = renderSlideSvg({
  design: { theme: 'classic', colorScheme: 'cool-horizon' },
  slides: [{
    table: {
      rows: [[[
        { text: 'Fallback', color: 'invalid' },
      ]]],
    },
  }],
}, 0);
const themeText = invalidFallback.match(/fill="([^"]+)"/)?.[1];
assert.ok(themeText);
assert.doesNotMatch(invalidFallback, /fill="invalid"/i);

console.log('Color reference renderer passed: scheme slots, roles, variables, hex, and invalid run fallback.');
