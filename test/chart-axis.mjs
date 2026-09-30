import assert from 'node:assert/strict';
import { validatePresentation } from '@openpresentation/opf';
import { renderSvg } from '../dist/svg.js';

// Public-API axis invariants for ordinary values. The pinned core packed-ecosystem
// harness (scripts/test-packed-ecosystem.mjs) runs this file by name against the
// installed renderer, so it keeps the historical name while asserting the
// catalog renderer's Office-like scale (test/chart-scale.mjs covers extremes).

const elements = (svg) => [...svg.matchAll(/<(rect|circle|line|polyline|path)\b([^>]*)\/?\s*>/g)].map(([, tag, attributes]) => ({
  tag, ...Object.fromEntries([...attributes.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))
}));

// Ordinary-range invariants ported from the retired legacy five-tick axis test:
// every authored value lands where the drawn value axis says it does, bars
// begin at the zero baseline, the axis includes zero for data that do not sit
// in the top sixth of the range, marks stay in the plot, rendering is byte
// deterministic and never mutates the authored document.
const ordinary = [
  ["positive", [1, 3, 2]],
  ["negative", [-1, -3, -2]],
  ["mixed-sign", [-2, 0, 3]],
  ["fractional", [0.25, 0.75, 0.5]],
  ["large", [1200, 3400, 2300]]
];
const attributesOf = (text) => Object.fromEntries([...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.01, `${message}: ${actual} != ${expected}`);
let ordinaryChecked = 0;
for (const [name, values] of ordinary) {
  for (const type of ["column", "bar", "line-with-markers"]) {
    const label = `${name}/${type}`;
    const horizontal = type === "bar";
    const input = { slides: [{ title: name, chart: { type, data: { columns: ["Category", "Value"], rows: values.map((v, i) => [`Item ${i + 1}`, v]) } } }] };
    const before = JSON.stringify(input);
    assert.equal(validatePresentation(input).valid, true, `${label}: valid source`);
    const svg = renderSvg(input, { trace: true });
    assert.equal(renderSvg(input, { trace: true }), svg, `${label}: deterministic bytes`);
    assert.equal(JSON.stringify(input), before, `${label}: unchanged authored source`);
    assert.doesNotMatch(svg, /NaN|Infinity/, `${label}: finite output`);
    const lines = [...svg.matchAll(/<line\b([^>]*)\/>/g)].map(([, a]) => attributesOf(a));
    const grids = lines.filter((l) => l["stroke-opacity"] === "0.7");
    const axes = lines.filter((l) => l.stroke === "#888888");
    // Value-axis tick labels are the chart-path text groups, one per gridline, in gridline order.
    const labels = [...svg.matchAll(/<g\b([^>]*data-opf-source-text="true"[^>]*)>([\s\S]*?)<\/g>/g)]
      .filter(([, a]) => attributesOf(a)["data-opf-path"] === "slides.0.chart")
      .map(([, , body]) => [...body.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(([, text]) => text).join(""));
    assert.ok(labels.length >= 2, `${label}: value axis has ticks`);
    const ticks = labels.map(Number);
    assert.ok(ticks.every(Number.isFinite), `${label}: numeric tick labels`);
    const grid = grids.filter((g) => horizontal ? g.x1 === g.x2 : g.y1 === g.y2);
    assert.equal(grid.length, ticks.length, `${label}: one gridline per tick label`);
    const position = (g) => Number(g[horizontal ? "x1" : "y1"]);
    const at = grid.map(position);
    const scale = (value) => at[0] + (value - ticks[0]) * (at.at(-1) - at[0]) / (ticks.at(-1) - ticks[0]);
    ticks.forEach((tick, i) => near(scale(tick), at[i], `${label}: evenly spaced ticks`));
    assert.ok(ticks[0] <= Math.min(...values) && ticks.at(-1) >= Math.max(...values), `${label}: axis covers every value`);
    assert.ok(ticks[0] <= 0 && ticks.at(-1) >= 0, `${label}: axis includes zero`);
    const zeroAxis = axes.find((l) => horizontal ? l.x1 === l.x2 : l.y1 === l.y2);
    assert.ok(zeroAxis, `${label}: zero baseline is drawn`);
    near(position(zeroAxis), scale(0), `${label}: zero baseline sits at value 0`);
    const marks = elements(svg).filter((s) => /^slides\.0\.chart\.data\.rows\.\d+\.1$/.test(s["data-opf-path"] ?? ""));
    assert.equal(marks.length, values.length, `${label}: every authored point is drawn`);
    marks.forEach((mark, i) => {
      assert.equal(mark["data-opf-path"], `slides.0.chart.data.rows.${i}.1`, `${label}: source row identity`);
      const v = values[i];
      if (type === "line-with-markers") {
        near(Number(mark.cy), scale(v), `${label}: marker ${i} at authored value`);
        assert.ok(Number(mark.cy) >= Math.min(at[0], at.at(-1)) - 0.01 && Number(mark.cy) <= Math.max(at[0], at.at(-1)) + 0.01, `${label}: marker in plot`);
      } else if (horizontal) {
        near(Number(mark.x) + (v < 0 ? 0 : Number(mark.width)), scale(v), `${label}: bar ${i} ends at authored value`);
        near(Number(mark.x) + (v < 0 ? Number(mark.width) : 0), scale(0), `${label}: bar ${i} begins at zero`);
      } else {
        near(Number(mark.y) + (v < 0 ? Number(mark.height) : 0), scale(v), `${label}: bar ${i} ends at authored value`);
        near(Number(mark.y) + (v < 0 ? 0 : Number(mark.height)), scale(0), `${label}: bar ${i} begins at zero`);
      }
    });
    ordinaryChecked++;
  }
}
console.log(`Chart axis passed: ${ordinaryChecked} public ordinary-range cases; authored fractions, zero baselines, evenly spaced ticks, source preservation and deterministic bytes.`);
