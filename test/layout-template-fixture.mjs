// OPF 0.19 (RR-81): sample decks for the 28 built-in layout templates, shared by test/layout-templates.mjs and
// test/layout-template-goldens.mjs. The templates are core's design-doc fixture (test/fixtures/layout-templates-0.19.json,
// copied from core packages/javascript/test/fixtures at opf#577) until @openpresentation/gallery 2.0.0 (RR-80) ships them;
// replace the fixture with the package then. The sample content mirrors core's composition goldens
// (packages/javascript/test/template-goldens.test.mjs): each template with 1 to 6 blocks of short and of long content, the
// kinds taken from the template's regions, so the renderer goldens draw the slides core's goldens compose.
import { readFileSync } from 'node:fs';
import { layoutTemplate } from '@openpresentation/opf/composition';

export const fixture = JSON.parse(readFileSync(new URL('./fixtures/layout-templates-0.19.json', import.meta.url), 'utf8'));
export const { layouts } = fixture;

// A picture that shows its crop: a diagonal gradient, a ring and a frame, drawn by the renderer as an embedded SVG image
// (no network, no asset resolver), so bled media regions and image fits are visible in the goldens.
const pictureSvg = (hue) => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">`
  + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,32%)"/></linearGradient></defs>`
  + `<rect width="1600" height="1000" fill="url(#g)"/><rect x="24" y="24" width="1552" height="952" fill="none" stroke="#ffffff" stroke-width="16"/>`
  + `<circle cx="800" cy="500" r="300" fill="none" stroke="#ffffff" stroke-width="40"/></svg>`;
export const picture = (index) => `data:image/svg+xml;base64,${Buffer.from(pictureSvg((index * 47) % 360)).toString('base64')}`;

const long = 'Customers told us onboarding took too long, so we rebuilt it around three steps, measured every one of them and removed the two that nobody needed; the flow now takes four minutes instead of twenty.';
export function payload(kind, index, size) {
  const big = size === 'long';
  switch (kind) {
    case 'text': return { text: big ? `${index + 1}. ${long}` : `Point ${index + 1}` };
    case 'list': return { items: Array.from({ length: big ? 7 : 3 }, (_, item) => (big ? `Item ${item + 1}: ${long.slice(0, 70)}` : `Item ${item + 1}`)) };
    case 'image': return { image: { src: picture(index), alt: `Picture ${index + 1}` } };
    case 'chart': return { chart: { type: 'column', data: { columns: ['Quarter', 'Revenue'], rows: [['Q1', 4.1 + index], ['Q2', 4.5], ['Q3', 5.2]] } } };
    case 'table': return { table: { columns: ['Plan', 'Seats', 'Price'], rows: Array.from({ length: big ? 9 : 3 }, (_, row) => [`Plan ${row + 1}`, String(10 * (row + 1)), `$${row + 5}`]) } };
    case 'code': return { code: { language: 'js', source: Array.from({ length: big ? 16 : 3 }, (_, line) => `const value${line} = compute(${line});`).join('\n') } };
    case 'metric': return { metric: { value: `${40 + index}%`, label: big ? long.slice(0, 90) : `Metric ${index + 1}` } };
    case 'quote': return { quote: { text: big ? long : 'It just works.', attribution: `Person ${index + 1}` } };
    case 'timeline': return { timeline: { events: Array.from({ length: big ? 6 : 3 }, (_, event) => ({ when: `Q${event + 1}`, what: big ? `Milestone ${event + 1} with a longer description` : `Step ${event + 1}` })) } };
    default: throw new Error(`No sample payload for kind ${kind}`);
  }
}

/** The kinds a sample slide uses: each region's first accepted kind (videos drawn as pictures), primary regions first. */
export function sampleKinds(record) {
  // Core's parsed template lists the regions in reading order; the sort is stable, as in core's goldens.
  const regions = [...layoutTemplate(record).regions].sort((a, b) => (a.role === 'primary' ? 0 : 1) - (b.role === 'primary' ? 0 : 1));
  return regions.map((region) => region.accepts.find((kind) => kind !== 'group' && kind !== 'video') ?? 'image');
}

export const COUNTS = [1, 2, 3, 4, 5, 6];
export const SIZES = ['short', 'long'];

/**
 * One deck per template: a slide for every count (1 to 6) and size (short, long), in that order, keyed
 * `<id> <count> <size>` as core's composition goldens are. Even counts draw cards (design.contentBox), so the goldens cover
 * carded and plain regions, and a bled region next to cards.
 */
export function templateDeck(id) {
  const record = layouts[id];
  const kinds = sampleKinds(record);
  const keys = [], slides = [];
  for (const size of SIZES) for (const count of COUNTS) {
    keys.push(`${id} ${count} ${size}`);
    slides.push({
      layout: id,
      title: size === 'long' ? `${record.name}: a longer title that may need a second line on the slide` : record.name,
      blocks: Array.from({ length: count }, (_, index) => payload(kinds.length ? kinds[index % kinds.length] : 'text', index, size)),
      ...(count % 2 === 0 ? { design: { contentBox: true } } : {}),
    });
  }
  return { keys, deck: { catalogs: { custom: { layouts: { [id]: record } } }, slides } };
}

/**
 * Slides that exercise what the count-and-size grid above does not reach: a lone list long enough to flow into two and
 * three columns (numbered, bulleted, described, carded, and a payload's fixed `columns`), a bled region beside cards, and
 * mirrored templates (deck design.mirror). Keyed `feature <layout> <case>`.
 */
export function featureDecks() {
  const items = (count) => Array.from({ length: count }, (_, index) => `Agenda item ${index + 1}: a part of the talk`);
  const questions = Array.from({ length: 10 }, (_, index) => ({ text: `Question ${index + 1}?`, description: `The answer to question ${index + 1}, in one sentence.` }));
  const decks = [
    { design: {}, cases: [
      ['agenda numbered-16', { layout: 'agenda', title: 'Agenda', blocks: [{ items: items(16), numbering: 'arabic' }] }],
      ['agenda bulleted-30', { layout: 'agenda', title: 'Agenda', blocks: [{ items: items(30) }] }],
      ['list carded-roman-18', { layout: 'list', title: 'List', design: { contentBox: true }, blocks: [{ items: items(18), numbering: 'roman-lower' }] }],
      ['faq described-10', { layout: 'faq', title: 'Questions', blocks: [{ items: questions }] }],
      ['text fixed-columns-3', { layout: 'text', title: 'Text', blocks: [{ items: items(9), columns: 3, numbering: 'arabic' }] }],
      ['cover carded', { layout: 'cover', title: 'Cover', subtitle: 'A bled picture never draws a card', design: { contentBox: true }, blocks: [{ image: { src: picture(0), alt: 'Picture' } }] }],
      ['image carded', { layout: 'image', title: 'Image', design: { contentBox: true }, blocks: [{ image: { src: picture(1), alt: 'Picture' } }] }],
    ] },
    { design: { mirror: true }, cases: [
      ['cover mirrored', { layout: 'cover', title: 'Cover', subtitle: 'Mirrored', blocks: [{ image: { src: picture(2), alt: 'Picture' } }] }],
      ['image-beside mirrored', { layout: 'image-beside', title: 'Image beside', blocks: [{ image: { src: picture(3), alt: 'Picture' } }, { text: 'The picture is on the other side.' }] }],
      ['hero mirrored', { layout: 'hero', title: 'Hero', blocks: [{ text: 'The lead message.' }, { image: { src: picture(4), alt: 'Picture' } }, { metric: { value: '42%', label: 'Support' } }] }],
    ] },
  ];
  return decks.map(({ design, cases }) => {
    const used = [...new Set(cases.map(([, slide]) => slide.layout))];
    return {
      keys: cases.map(([key]) => `feature ${key}`),
      deck: { design, catalogs: { custom: { layouts: Object.fromEntries(used.map((id) => [id, layouts[id]])) } }, slides: cases.map(([, slide]) => slide) },
    };
  });
}
