import assert from 'node:assert/strict';
import { resolvePresentation, toSvg } from '../dist/index.js';
import * as harness from './catalog-harness.mjs';
import { featureDecks, layouts, templateDeck } from './layout-template-fixture.mjs';

// OPF 0.19 (RR-81): the renderer draws layout-template slides from core's geometry (SlideComposition.regions and the
// items core places in them) and adds nothing of its own: cards are core's frameBox, a bled region reaches the slide edge
// with no card, a list in columns draws every column core broke it into, and with trace every item of a region is grouped
// under data-opf-region. 0.18 (opf-layout/v1) slides draw exactly as before (test/golden.mjs keeps their hashes).
const attr = (attrs, name) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1];
const near = (a, b, message) => assert.ok(Math.abs(Number(a) - b) <= 0.006, `${message}: ${a} vs ${b}`);
const openTags = (svg) => [...svg.matchAll(/<([a-z]+)\b([^>]*?)\/?>/g)].map((match) => ({ name: match[1], attrs: match[2], index: match.index }));

let regionItems = 0, cards = 0, bled = 0, columnLists = 0;
const decks = [...Object.keys(layouts).map(templateDeck), ...featureDecks()];
for (const { keys, deck } of decks) {
  const resolved = resolvePresentation(deck);
  const traced = toSvg(deck, { trace: true }), plain = toSvg(deck);
  for (const bound of resolved.slides) {
    const key = keys[bound.index], svg = traced[bound.index], geometry = bound.geometry;
    assert.ok(Array.isArray(geometry.regions), `${key}: core composed the template's regions`);
    const tags = openTags(svg);
    const regionOf = new Map(geometry.regions.map((region) => [region.name, region]));
    for (const item of geometry.items) {
      const own = tags.filter((tag) => attr(tag.attrs, 'data-opf-path') === item.path);
      if (item.region === undefined) {
        // Headings and anything else outside a region are not grouped.
        assert.ok(own[0], `${key}: ${item.path} is drawn`);
        assert.ok(!svg.slice(Math.max(0, own[0].index - 60), own[0].index).includes('data-opf-region'), `${key}: ${item.path} is not in a region group`);
        continue;
      }
      regionItems++;
      const region = regionOf.get(item.region);
      assert.ok(region, `${key}: ${item.path} names a region of the slide (${item.region})`);
      // The first element an item draws opens right after its region group.
      const first = own[0];
      assert.ok(first, `${key}: ${item.path} is drawn`);
      const opener = `<g data-opf-region="${item.region}">`;
      assert.equal(svg.slice(first.index - opener.length, first.index), opener, `${key}: ${item.path} is grouped under its region`);
      // Cards are core's frameBox, drawn as the item's first element; a bled region never has one.
      const card = own.find((tag) => tag.name === 'rect' && attr(tag.attrs, 'stroke') !== undefined && attr(tag.attrs, 'rx') !== undefined && attr(tag.attrs, 'stroke-dasharray') === undefined);
      if (item.frameBox) {
        cards++;
        assert.ok(!region.bleed, `${key}: ${item.path} has a card in a bled region`);
        assert.equal(card, first, `${key}: ${item.path} draws its card first`);
        near(attr(card.attrs, 'x'), item.frameBox.x, `${key}: ${item.path} card x`);
        near(attr(card.attrs, 'y'), item.frameBox.y, `${key}: ${item.path} card y`);
        near(attr(card.attrs, 'width'), item.frameBox.width, `${key}: ${item.path} card width`);
        near(attr(card.attrs, 'height'), item.frameBox.height, `${key}: ${item.path} card height`);
      } else {
        assert.equal(card, undefined, `${key}: ${item.path} draws no card core did not compose`);
      }
      // A bled region reaches the slide edge: its picture is drawn at core's box, which touches the edges of the slide.
      if (region.bleed && item.field === 'image' && !region.collapsed) {
        bled++;
        const picture = own.find((tag) => tag.name === 'image');
        assert.ok(picture, `${key}: ${item.path} draws its picture`);
        const box = { x: Number(attr(picture.attrs, 'x')), y: Number(attr(picture.attrs, 'y')), width: Number(attr(picture.attrs, 'width')), height: Number(attr(picture.attrs, 'height')) };
        assert.deepEqual(box, { x: item.box.x, y: item.box.y, width: item.box.width, height: item.box.height }, `${key}: ${item.path} picture box`);
        const edges = [box.x <= 0.01, box.y <= 0.01, box.x + box.width >= geometry.width - 0.01, box.y + box.height >= geometry.height - 0.01].filter(Boolean).length;
        assert.ok(edges >= 2, `${key}: ${item.path} bleeds to the slide edge (${JSON.stringify(box)})`);
      }
      // A list in columns: every column core broke it into is drawn in its own box, with every item exactly once and the
      // numbering continuing across the columns.
      if (item.listColumns) {
        columnLists++;
        const mine = tags.filter((tag) => tag.index > first.index && attr(tag.attrs, 'data-opf-list-column') !== undefined).slice(0, item.listColumns.length);
        assert.equal(mine.length, item.listColumns.length, `${key}: ${item.path} draws ${item.listColumns.length} columns`);
        item.listColumns.forEach((column, index) => {
          const drawn = mine[index].attrs;
          assert.equal(attr(drawn, 'data-opf-list-column'), String(index));
          assert.equal(attr(drawn, 'data-opf-list-start'), String(column.start));
          assert.equal(attr(drawn, 'data-opf-list-end'), String(column.end));
          near(attr(drawn, 'data-opf-box-x'), column.box.x, `${key}: column ${index} x`);
          near(attr(drawn, 'data-opf-box-width'), column.box.width, `${key}: column ${index} width`);
          if (index) assert.equal(column.start, item.listColumns[index - 1].end, `${key}: columns are contiguous`);
        });
        const count = item.value.length;
        assert.equal(item.listColumns.at(-1).end, count, `${key}: the columns hold the whole list`);
        // Every item of the payload is drawn exactly once, in the column core put it in, at the path core traced.
        const entries = item.listColumns.flatMap((column) => column.text.listEntries.map((entry) => ({ ...entry, column })));
        assert.deepEqual(entries.map((entry) => entry.index), Array.from({ length: count }, (_, index) => index), `${key}: each item in one column, in order`);
        for (const entry of entries) {
          assert.ok(entry.index >= entry.column.start && entry.index < entry.column.end, `${key}: item ${entry.index} in its column`);
          const texts = tags.filter((tag) => tag.name === 'g' && attr(tag.attrs, 'data-opf-path') === entry.textPath);
          assert.equal(texts.length, 1, `${key}: ${entry.textPath} drawn once`);
          // Known core gap (opf#577, RR-79): in a numbered list, the first item of a later column that is a plain string
          // becomes { text, start } in core's sliceNumberedItems to carry its number, so core traces it as <item>.text, a path
          // the source does not have. Accept exactly that case until core keeps the source path.
          const own = `${item.path}.${entry.index}`, carried = item.payload.numbering !== undefined && entry.index === entry.column.start && entry.index > 0;
          if (typeof item.value[entry.index] === 'string') assert.ok(entry.textPath === own || (carried && entry.textPath === `${own}.text`), `${key}: ${entry.textPath} is the source path ${own}`);
        }
        if (item.payload.numbering === 'arabic') {
          const markers = [...svg.matchAll(/<text\b[^>]*aria-hidden="true"[^>]*>(\d+)\.<\/text>/g)].map((match) => Number(match[1]));
          assert.deepEqual(markers, Array.from({ length: count }, (_, index) => index + 1), `${key}: numbering continues across columns`);
        }
        // Without trace the columns are drawn the same, with no trace attributes.
        assert.ok(!plain[bound.index].includes('data-opf-list-column') && !plain[bound.index].includes('data-opf-region'), `${key}: untraced output carries no trace`);
        for (const column of item.listColumns) for (const entry of column.text.listEntries) {
          assert.ok(plain[bound.index].includes(`>${entry.marker.text}</text>`), `${key}: untraced marker ${entry.marker.text}`);
        }
      }
    }
  }
}
assert.ok(regionItems > 900, `region items checked: ${regionItems}`);
assert.ok(cards > 0 && cards < regionItems, `cards checked: ${cards}`);
assert.ok(bled >= 25, `bled pictures checked: ${bled}`);
assert.ok(columnLists >= 5, `lists in columns checked: ${columnLists}`);

// 0.18 slides (opf-layout/v1 records from the gallery snapshot) carry no template metadata and draw as before.
const v1 = { design: { contentBox: true }, slides: [
  { layout: 'list-2x', title: 'Two lists', blocks: [{ items: ['One', 'Two', 'Three'] }, { items: ['Four', 'Five'] }] },
  { layout: 'image-1x', title: 'Picture', image: { src: 'https://example.com/picture.png', alt: 'Picture' } },
  { title: 'Automatic', blocks: [{ items: Array.from({ length: 16 }, (_, index) => `Item ${index + 1}`) }] },
] };
const v1Resolved = harness.resolvePresentation(v1);
for (const bound of v1Resolved.slides) {
  assert.equal(bound.geometry.regions, undefined, `v1 slide ${bound.index}: no template regions`);
  assert.ok(bound.geometry.items.every((item) => item.region === undefined && item.listColumns === undefined), `v1 slide ${bound.index}: no region or list columns`);
}
for (const svg of harness.toSvg(v1, { trace: true })) {
  assert.ok(!svg.includes('data-opf-region') && !svg.includes('data-opf-list-column'), 'v1 slides carry no template trace');
}
console.log(`Layout templates: ${regionItems} region items, ${cards} cards, ${bled} bled pictures and ${columnLists} lists in columns drawn from core's geometry.`);
