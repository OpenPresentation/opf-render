import assert from 'node:assert/strict';
import { renderSlideSvg } from './catalog-harness.mjs';

// FA-27: Table.alt is the table's accessible name in the preview, as Chart.alt is the chart's (FA-09). A role="img" group with
// aria-label wraps the table, an empty alt hides it (aria-hidden), and a table without alt draws exactly the same SVG as before.

const table = { columns: ['Region', 'Q4'], rows: [['North America', 18.1], ['EMEA', 11.5]] };
const deck = (extra = {}, slide = {}) => ({ design: { fontScheme: 'roboto' }, slides: [{ title: 'Revenue', table: { ...table, ...extra }, ...slide }] });
const alt = 'North America leads EMEA, $18.1M against $11.5M in Q4 ("EMEA" in grey).';

const plain = renderSlideSvg(deck(), 0);
const labelled = renderSlideSvg(deck({ alt }), 0);
assert.match(labelled, /<g aria-label="North America leads EMEA, \$18\.1M against \$11\.5M in Q4 \(&quot;EMEA&quot; in grey\)\." role="img">/, 'labelled group');
assert.equal(labelled.split('role="img"').length - 1, plain.split('role="img"').length, 'exactly one new role=img group');
const decorative = renderSlideSvg(deck({ alt: '' }), 0);
assert.match(decorative, /<g aria-hidden="true">/, 'a decorative table is aria-hidden');
assert.doesNotMatch(decorative, /aria-label="[^"]*North/, 'no label on a decorative table');

// The wrapper adds nothing else: taking its two tags out reproduces the plain SVG byte for byte, for a labelled and a decorative table.
for (const [name, svg, open] of [['labelled', labelled, /<g aria-label="[^"]*" role="img">/], ['decorative', decorative, /<g aria-hidden="true">/]]) {
  const rest = svg.replace(open.exec(svg)[0], '');
  const ends = [...rest.matchAll(/<\/g>/g)].map((match) => match.index);
  assert.ok(ends.some((at) => rest.slice(0, at) + rest.slice(at + 4) === plain), `${name}: only the wrapper tags are added`);
}

// A table in a block, beside other text, is labelled the same way; the text beside it is untouched.
{
  const svg = renderSlideSvg({ design: { fontScheme: 'roboto' }, slides: [{ title: 'T', blocks: [{ table: { ...table, alt: 'Q4 by region' } }, { text: 'Beside' }] }] }, 0);
  assert.match(svg, /aria-label="Q4 by region" role="img"/);
  assert.match(svg, />Beside</);
}

// A chart's alt does not leak onto a table beside it: each payload gets its own group.
{
  const both = (chartAlt) => renderSlideSvg({ design: { fontScheme: 'roboto' }, slides: [{ title: 'T', blocks: [{ table }, { chart: { type: 'column', ...chartAlt, data: { columns: ['Q', 'V'], rows: [['Q1', 1]] } } }] }] }, 0);
  const svg = both({ alt: 'Chart words' });
  assert.equal(svg.split('role="img"').length - both({}).split('role="img"').length, 1);
  assert.match(svg, /aria-label="Chart words"/);
}
