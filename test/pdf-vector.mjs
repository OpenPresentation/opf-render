// RR-12: vector PDF with selectable text. Checks the PDF structure, a text-extraction round trip against the authored
// text (Latin ligatures and accents, CJK, right-to-left and mixed-direction), determinism, links, metadata, tagging,
// font-embedding permissions, diagnostics and fallbacks, and (separately, test/pdf-vector-visual.mjs) appearance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, PDFHexString, decodePDFRawStream } from "pdf-lib";
import { renderSvgDeck, svgToPdf, svgToPng } from "../dist/index.js";
import { loadBundledFontRegistry, loadOfficeFontRegistry } from "../dist/fonts-node.js";
import sharp from "sharp";
import { compareImages, openPdf, pageBlocks, pageItems, pageText, renderPdfPage } from "./pdf-helpers.mjs";

const TINY_PNG = "data:image/png;base64," + (await sharp({ create: { width: 4, height: 4, channels: 3, background: "#e03030" } }).png().toBuffer()).toString("base64");
const SCHEMA = "https://openpresentation.org/schema/opf/v1";
const nfkc = (text) => text.normalize("NFKC").replace(/\s+/g, " ").trim();
// Lines wrap, so whole-text comparisons ignore all whitespace; word-level checks keep it.
const compact = (text) => nfkc(text).replace(/\s/g, "");

async function renderDeck(deck, options = {}) {
  const fonts = await loadOfficeFontRegistry({ substitutionPolicy: "visual", scripts: "auto", presentation: deck });
  const svgs = renderSvgDeck(deck, { trace: true, textMeasurement: fonts.textMeasurement, embeddedFonts: fonts.embeddedFonts, ...options });
  return { svgs, pdfOptions: { fontFiles: fonts.fontFiles, useBundledFonts: false } };
}

async function lowLevel(bytes) {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const objects = document.context.enumerateIndirectObjects();
  const stream = (object) => Buffer.from(decodePDFRawStream(object).decode());
  return { document, objects, stream };
}

// ---- API surface ----------------------------------------------------------------------------------------------
{
  const { svgs, pdfOptions } = await renderDeck({ $schema: SCHEMA, name: "API", slides: [{ title: "Hello", text: "World" }] });
  const byDefault = await svgToPdf(svgs, pdfOptions);
  const explicit = await svgToPdf(svgs, { ...pdfOptions, mode: "vector" });
  assert.deepEqual(byDefault, explicit, "vector is the default PDF mode");
  const raster = await svgToPdf(svgs, { ...pdfOptions, mode: "raster", scale: 0.25 });
  assert.notDeepEqual(raster, byDefault);
  await assert.rejects(svgToPdf(svgs, { mode: "bitmap" }), (error) => error.code === "invalid-conversion-option" && error.details.option === "mode");
  await assert.rejects(svgToPdf(svgs, { ...pdfOptions, loadSystemFonts: true }), (error) => error.code === "pdf-system-fonts-unsupported");
  // The raster mode stays an image per page; the vector mode has no page-sized picture and real text.
  const rasterLow = await lowLevel(raster);
  const rasterImages = rasterLow.objects.filter(([, object]) => object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image");
  assert.equal(rasterImages.length, 1, "raster mode: one image per slide");
  assert.equal((await pageItems(await openPdf(raster), 1)).length, 0, "raster mode has no extractable text");
  assert.match(await pageText(await openPdf(byDefault), 1), /Hello World/, "vector mode extracts the authored text");
}

// ---- Structure: real text, embedded subsets, no page-sized image ---------------------------------------------------
{
  const deck = { $schema: SCHEMA, name: "Structure", language: "en-GB", slides: [{ title: "Quarterly review", text: "Revenue grew 12% year on year.", items: ["First point", "Second point"] }] };
  const { svgs, pdfOptions } = await renderDeck(deck);
  const diagnostics = [];
  const pdf = await svgToPdf(svgs, { ...pdfOptions, onDiagnostic: (d) => diagnostics.push(d) });
  const { document, objects, stream } = await lowLevel(pdf);
  const [page] = document.getPages();
  const { width, height } = page.getSize();
  assert.deepEqual([width, height], [1280, 720], "page size comes from the SVG");
  let fonts = 0;
  for (const [, object] of objects) {
    if (!(object instanceof PDFDict)) continue;
    if (object.get(PDFName.of("Subtype"))?.toString() === "/Type0") {
      fonts++;
      assert.match(object.get(PDFName.of("BaseFont")).toString(), /^\/[A-Z]{6}\+/, "subset tag");
      assert.ok(object.get(PDFName.of("ToUnicode")), "ToUnicode map");
    }
  }
  assert.ok(fonts >= 1);
  const descriptors = objects.filter(([, object]) => object instanceof PDFDict && object.get(PDFName.of("Type"))?.toString() === "/FontDescriptor");
  assert.equal(descriptors.length, fonts);
  for (const [, descriptor] of descriptors) assert.ok(descriptor.get(PDFName.of("FontFile2")), "TrueType subset embedded");
  for (const [, object] of objects) {
    if (!(object instanceof PDFRawStream) || object.dict.get(PDFName.of("Subtype"))?.toString() !== "/Image") continue;
    const w = object.dict.get(PDFName.of("Width")).asNumber(), h = object.dict.get(PDFName.of("Height")).asNumber();
    assert.ok(w < width * 0.9 || h < height * 0.9, "no page-sized image in vector output");
  }
  const contents = page.node.Contents();
  const content = stream(document.context.lookup(contents));
  const operators = content.toString("latin1");
  assert.match(operators, /BT[\s\S]*?\bTJ\b[\s\S]*?ET/, "text is drawn with text operators");
  assert.ok(!/\sTr\n/.test(operators) || !/\n3 Tr/.test(operators), "no invisible (render mode 3) text layer");
  const embedded = diagnostics.filter((d) => d.code === "pdf-font-embedded");
  assert.equal(embedded.length, fonts);
  for (const report of embedded) {
    assert.equal(report.embedding, "subset");
    assert.ok(report.bytes < 40_000, `subset ${report.postscriptName} is small (${report.bytes} bytes)`);
    assert.ok(!/arial|calibri|aptos|helvetica|times/i.test(report.postscriptName), "never a proprietary face");
  }
  assert.deepEqual(diagnostics.filter((d) => d.code === "pdf-raster-fallback"), [], "nothing was rasterized");
  const doc = await openPdf(pdf);
  assert.match(await pageText(doc, 1), /Quarterly review.*Revenue grew 12% year on year\..*First point.*Second point/);
}

// ---- Text round trip: Latin, CJK, right-to-left, mixed ---------------------------------------------------------------
const roundTrips = [
  {
    name: "latin",
    deck: { $schema: SCHEMA, name: "Latin", slides: [{
      title: "Résumé: naïve façade ﬁnal ﬂow",
      text: "Café déjà vu, with é and ö combining marks, ligatures ﬁ ﬂ ﬃ, “smart quotes”, an en–dash and 100% — done.",
      items: ["Zoë’s 3 × 4 ≈ 12", "Ångström & Œuvre"],
    }] },
    expect: ["Résumé: naïve façade final flow", "Café déjà vu, with é and ö combining marks, ligatures fi fl ffi, “smart quotes”, an en–dash and 100% — done.", "Zoë’s 3 × 4 ≈ 12", "Ångström & Œuvre"],
  },
  {
    name: "japanese",
    deck: { $schema: SCHEMA, name: "Japanese", language: "ja", slides: [{ title: "四半期レビュー", text: "日本語のテキストと漢字、カタカナ。", items: ["売上は12%増加", "計画を確認する"] }] },
    expect: ["四半期レビュー", "日本語のテキストと漢字、カタカナ。", "売上は12%増加", "計画を確認する"],
  },
  {
    name: "chinese-and-korean",
    deck: { $schema: SCHEMA, name: "CJK", language: "zh-Hans", slides: [{ title: "季度回顾", text: "收入同比增长百分之十二，成本保持稳定。", items: ["분기별 검토", "Ship 日本語 text"] }] },
    expect: ["季度回顾", "收入同比增长百分之十二，成本保持稳定。", "분기별 검토", "Ship 日本語 text"],
  },
  {
    name: "arabic",
    deck: { $schema: SCHEMA, name: "Arabic", language: "ar", slides: [{ title: "مراجعة ربع سنوية", text: "نمت الإيرادات بنسبة 12% مقارنة بالعام الماضي", items: ["الهدف الأول", "الهدف الثاني"] }] },
    expect: ["مراجعة ربع سنوية", "نمت الإيرادات بنسبة 12% مقارنة بالعام الماضي", "الهدف الأول", "الهدف الثاني"],
  },
  {
    name: "hebrew",
    deck: { $schema: SCHEMA, name: "Hebrew", language: "he", slides: [{ title: "סקירה רבעונית", text: "ההכנסות צמחו ב־12% לעומת השנה שעברה", items: ["יעד ראשון"] }] },
    expect: ["סקירה רבעונית", "ההכנסות צמחו ב־12% לעומת השנה שעברה", "יעד ראשון"],
  },
];
for (const { name, deck, expect } of roundTrips) {
  const { svgs, pdfOptions } = await renderDeck(deck);
  const pdf = await svgToPdf(svgs, pdfOptions);
  const doc = await openPdf(pdf);
  const rtl = Boolean(deck.language && /^(ar|he)/.test(deck.language));
  const text = nfkc((await pageBlocks(doc, 1, { rtl })).join(" "));
  for (const wanted of expect) {
    // Within a line, the logical text of each right-to-left run is recovered; compare run by run so a visual-order
    // reader (pdf.js reports runs left to right) is not penalised for line-level run order in mixed text.
    assert.ok(compact(text).includes(compact(wanted)), `${name}: extracted text keeps "${wanted}"; got "${text}"`);
  }
}

// Mixed-direction line: every word survives, and each right-to-left run reads in logical order.
{
  const deck = { $schema: SCHEMA, name: "Mixed", slides: [{ title: "Roadmap", text: "Revenue شركة 2026 growth and שלום עולם end" }] };
  const { svgs, pdfOptions } = await renderDeck(deck);
  const pdf = await svgToPdf(svgs, pdfOptions);
  const text = nfkc(await pageText(await openPdf(pdf), 1));
  for (const word of ["Revenue", "شركة", "2026", "growth", "and", "שלום עולם", "end"]) assert.ok(compact(text).includes(compact(word)), `mixed: ${word} in "${text}"`);
  // /ActualText carries the logical text of each right-to-left run for viewers that honour it (PDFium, Acrobat).
  const { document, stream } = await lowLevel(pdf);
  const content = stream(document.context.lookup(document.getPages()[0].node.Contents())).toString("latin1");
  const actual = [...content.matchAll(/\/ActualText <FEFF([0-9A-F]+)>/g)].map((match) => Buffer.from(match[1], "hex").swap16().toString("utf16le"));
  assert.ok(actual.some((value) => value.includes("شركة 2026")) && actual.some((value) => value.includes("שלום עולם")), "ActualText holds the logical right-to-left runs");
}

// ---- Determinism --------------------------------------------------------------------------------------------------------
{
  const deck = { $schema: SCHEMA, name: "Determinism", slides: [{ title: "Same bytes", text: "Every run, every machine." }, { title: "Second slide", items: ["One", "Two"] }] };
  const { svgs, pdfOptions } = await renderDeck(deck);
  const first = await svgToPdf(svgs, pdfOptions);
  const second = await svgToPdf(svgs, pdfOptions);
  assert.deepEqual(first, second, "repeatable bytes");
  const withDates = await svgToPdf(svgs, { ...pdfOptions, metadata: { title: "T", creationDate: "2026-01-02T03:04:05Z" } });
  assert.deepEqual(withDates, await svgToPdf(svgs, { ...pdfOptions, metadata: { title: "T", creationDate: new Date("2026-01-02T03:04:05Z") } }), "caller-supplied dates are the only dates");
  const text = Buffer.from(first).toString("latin1");
  assert.ok(!/CreationDate|ModDate/.test(text), "no timestamps unless the caller supplies them");
  assert.match(text, /\/ID\[<[0-9A-F]{32}><[0-9A-F]{32}>\]/);
  // Uncompressed output carries the same content (a debugging aid), also repeatable.
  const plain = await svgToPdf(svgs, { ...pdfOptions, compress: false });
  assert.deepEqual(plain, await svgToPdf(svgs, { ...pdfOptions, compress: false }));
  assert.ok(plain.length > first.length);
}

// ---- Pages, metadata, language, links, tagging ------------------------------------------------------------------------
{
  const wide = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450" lang="fr-CA"><rect width="800" height="450" fill="#eef"/><a href="https://example.com/path?q=1&amp;r=%C3%A9"><text x="40" y="100" font-family="Roboto" font-size="30" fill="#06c" text-decoration="underline" xml:space="preserve">Lien de test</text></a><a href="javascript:alert(1)"><text x="40" y="160" font-family="Roboto" font-size="30" xml:space="preserve">Not a link</text></a></svg>`;
  const portrait = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700" viewBox="0 0 400 700"><rect width="400" height="700" fill="#fee"/><image width="64" height="64" x="20" y="20" aria-label="Pixel" href="${TINY_PNG}"/><text x="20" y="130" font-family="Roboto" font-size="20">Portrait page</text></svg>`;
  const diagnostics = [];
  const pdf = await svgToPdf([wide, portrait], {
    metadata: { title: "Deck title", author: "Ada Lovelace", subject: "Test", keywords: ["a", "b"], language: "fr-CA", creationDate: "2026-05-06T07:08:09Z" },
    onDiagnostic: (d) => diagnostics.push(d),
  });
  const { document, objects } = await lowLevel(pdf);
  const pages = document.getPages();
  assert.deepEqual(pages.map((page) => Object.values(page.getSize())), [[800, 450], [400, 700]], "each page keeps its own size");
  assert.equal(document.getTitle(), "Deck title");
  assert.equal(document.getAuthor(), "Ada Lovelace");
  assert.equal(document.getKeywords(), "a, b");
  const catalog = document.catalog;
  assert.equal(catalog.get(PDFName.of("Lang")).decodeText(), "fr-CA");
  assert.equal(catalog.get(PDFName.of("MarkInfo")).get(PDFName.of("Marked")).toString(), "true");
  assert.ok(catalog.get(PDFName.of("StructTreeRoot")), "structure tree for reading order");
  assert.ok(catalog.get(PDFName.of("Metadata")), "XMP metadata");
  const annotations = objects.filter(([, object]) => object instanceof PDFDict && object.get(PDFName.of("Subtype"))?.toString() === "/Link");
  assert.equal(annotations.length, 1, "one link; the javascript: target is refused");
  const action = annotations[0][1].get(PDFName.of("A"));
  assert.equal(action.get(PDFName.of("URI")).decodeText(), "https://example.com/path?q=1&r=%C3%A9");
  assert.ok(diagnostics.some((d) => d.code === "pdf-link-skipped"));
  const rect = annotations[0][1].get(PDFName.of("Rect")).asArray().map((n) => n.asNumber());
  assert.ok(rect[0] >= 35 && rect[2] > rect[0] + 100 && rect[1] > 300 && rect[3] < 450, `link rectangle sits on its text (${rect})`);
  const roles = objects.filter(([, object]) => object instanceof PDFDict && object.get(PDFName.of("Type"))?.toString() === "/StructElem").map(([, object]) => object.get(PDFName.of("S")).toString());
  for (const role of ["/Document", "/Sect", "/P", "/Link", "/Figure"]) assert.ok(roles.includes(role), `structure has ${role}`);
  const untagged = await svgToPdf([wide], { tagged: false });
  assert.ok(!(await lowLevel(untagged)).document.catalog.get(PDFName.of("StructTreeRoot")), "tagging can be switched off");
  assert.match(await pageText(await openPdf(pdf), 1), /Lien de test/);
}

// ---- Fonts: only what is supplied; embedding permissions are honoured; no system fonts --------------------------------
{
  const registry = await loadBundledFontRegistry();
  const roboto = registry.fontFiles.find((file) => /Roboto_400Regular\.ttf$/.test(file));
  assert.ok(roboto, "bundled Roboto Regular");
  const bytes = new Uint8Array(await readFile(roboto));
  // Set the OS/2 fsType restricted-license embedding bit in a private copy.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4);
  let patched = false;
  for (let index = 0; index < count; index++) {
    const at = 12 + index * 16;
    if (String.fromCharCode(...bytes.subarray(at, at + 4)) === "OS/2") { view.setUint16(view.getUint32(at + 8) + 8, 0x0002); patched = true; }
  }
  assert.ok(patched);
  const directory = await mkdtemp(path.join(os.tmpdir(), "opf-pdf-"));
  try {
    const restricted = path.join(directory, "Restricted.ttf");
    await writeFile(restricted, bytes);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100"><text x="10" y="50" font-family="Roboto" font-size="20">Embeddable text</text></svg>`;
    // Only the restricted face is supplied: nothing may be embedded, so the export refuses rather than bypass it.
    const diagnostics = [];
    await assert.rejects(svgToPdf(svg, { useBundledFonts: false, fontFiles: [restricted], onDiagnostic: (d) => diagnostics.push(d) }), (error) => error.code === "pdf-font-unavailable");
    assert.ok(diagnostics.some((d) => d.code === "pdf-font-embedding-restricted"), "restriction reported");
    // With a permitted face also available, the permitted one is used and reported as the substitute.
    const both = [];
    const pdf = await svgToPdf(svg, { useBundledFonts: false, fontFiles: [restricted, registry.fontFiles.find((file) => /Roboto_500Medium\.ttf$/.test(file))], onDiagnostic: (d) => both.push(d) });
    assert.match(await pageText(await openPdf(pdf), 1), /Embeddable text/);
    const embedded = both.filter((d) => d.code === "pdf-font-embedded");
    assert.equal(embedded.length, 1);
    assert.equal(embedded[0].weight, 500, "the permitted face was embedded");
    assert.ok(both.some((d) => d.code === "pdf-font-embedding-restricted"));
    // fontDirs are searched too, and every face found there is checked the same way.
    const fromDirectory = await svgToPdf(svg, { useBundledFonts: false, fontDirs: [path.dirname(roboto)] });
    assert.match(await pageText(await openPdf(fromDirectory), 1), /Embeddable text/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  // A requested family that has no face is reported, with the face used instead.
  const notes = [];
  await svgToPdf(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><text x="10" y="50" font-family="Garamond, serif" font-size="20">Substituted</text></svg>`, { onDiagnostic: (d) => notes.push(d) });
  const substituted = notes.find((d) => d.code === "pdf-font-substituted");
  assert.equal(substituted?.requestedFamily, "Garamond");
  assert.equal(substituted?.resolvedFamily, "roboto");
}

// ---- Effects with no vector equivalent: reported, rasterized for that element only, or rejected in strict mode --------------
{
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><defs><filter id="f"><feColorMatrix type="saturate" values="0"/></filter></defs><rect width="300" height="200" fill="#fff"/><g data-opf-path="slides.0.shape" filter="url(#f)"><rect x="20" y="20" width="100" height="60" fill="#f80"/></g><text x="20" y="150" font-family="Roboto" font-size="24">Still real text</text></svg>`;
  const diagnostics = [];
  const pdf = await svgToPdf(svg, { onDiagnostic: (d) => diagnostics.push(d) });
  const fallback = diagnostics.filter((d) => d.code === "pdf-raster-fallback");
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].path, "slides.0.shape", "the fallback names the affected path");
  assert.match(await pageText(await openPdf(pdf), 1), /Still real text/);
  await assert.rejects(svgToPdf(svg, { strict: true }), (error) => error.code === "pdf-raster-fallback" && error.details.path === "slides.0.shape");
  await assert.rejects(svgToPdf("<html/>"), (error) => error.code === "invalid-svg");
}

// ---- Vector drawing: shapes stay paths, gradients and patterns stay PDF shadings/tilings, translucent groups stay groups -----
{
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient><pattern id="p" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8L8 0" stroke="#999" stroke-width="2"/></pattern></defs><rect width="400" height="300" fill="url(#p)"/><rect x="20" y="20" width="120" height="80" fill="url(#g)" rx="10"/><g opacity="0.5"><rect x="200" y="20" width="80" height="80" fill="#f00"/><rect x="240" y="60" width="80" height="80" fill="#00f"/></g></svg>`;
  const pdf = await svgToPdf(svg);
  const { objects } = await lowLevel(pdf);
  const types = objects.map(([, object]) => (object instanceof PDFDict ? object : object.dict)?.get?.(PDFName.of("PatternType"))?.toString()).filter(Boolean);
  assert.deepEqual(types.sort(), ["1", "2"], "one tiling pattern and one shading pattern");
  assert.ok(objects.some(([, object]) => (object.dict ?? object)?.get?.(PDFName.of("Subtype"))?.toString() === "/Form"), "opacity group is a form XObject");
  assert.ok(!objects.some(([, object]) => object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image"), "no raster image anywhere");
}

// ---- Pictures: JPEG (all eight EXIF orientations), WebP and PNG alpha keep their pixels in the vector PDF -------------------
{
  const imageSvg = (width, height, uri, extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image aria-label="Specimen" x="0" y="0" width="${width}" height="${height}" href="${uri}" ${extra}/></svg>`;
  for (let orientation = 1; orientation <= 8; orientation++) {
    const jpeg = await readFile(new URL(`fixtures/jpeg/orientation-${orientation}.jpg`, import.meta.url));
    const expected = await readFile(new URL(`fixtures/jpeg/expected-${orientation}.png`, import.meta.url));
    const { width, height } = await sharp(expected).metadata();
    const pdf = await svgToPdf(imageSvg(width, height, "data:image/jpeg;base64," + jpeg.toString("base64")));
    const rendered = await renderPdfPage(await openPdf(pdf), 1);
    const { mae } = await compareImages(rendered.png, expected, { factor: 1 });
    assert.ok(mae <= 3, `JPEG orientation ${orientation} keeps its pixels in the vector PDF (mean error ${mae.toFixed(2)})`);
    // An unoriented JPEG is passed through undecoded (DCTDecode).
    const jpegStreams = (await lowLevel(pdf)).objects.filter(([, object]) => object instanceof PDFRawStream && object.dict.get(PDFName.of("Filter"))?.toString() === "/DCTDecode");
    assert.equal(jpegStreams.length, orientation === 1 ? 1 : 0, `orientation ${orientation}: JPEG pass-through only when upright`);
  }
  const references = JSON.parse(await readFile(new URL("fixtures/webp/webp-references.json", import.meta.url), "utf8"));
  for (const [file, reference] of Object.entries(references)) {
    const bytes = await readFile(new URL(`fixtures/webp/${file}`, import.meta.url));
    const decoded = await sharp(bytes).autoOrient().ensureAlpha().png().toBuffer();
    const webpSvg = imageSvg(reference.width, reference.height, "data:image/webp;base64," + bytes.toString("base64"));
    const pngSvg = imageSvg(reference.width, reference.height, "data:image/png;base64," + decoded.toString("base64"));
    const rendered = await renderPdfPage(await openPdf(await svgToPdf(webpSvg)), 1);
    const { mae } = await compareImages(rendered.png, await svgToPng(pngSvg), { factor: 1 });
    assert.ok(mae <= 3, `${file}: WebP (with transparency) draws as the decoded picture (mean error ${mae.toFixed(2)})`);
  }
  // The same picture used twice is stored once.
  const png = TINY_PNG;
  const twice = await svgToPdf(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><image x="0" y="0" width="40" height="40" href="${png}"/><image x="50" y="0" width="40" height="40" href="${png}"/></svg>`);
  assert.equal((await lowLevel(twice)).objects.filter(([, object]) => object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image").length, 1, "identical pictures share one image object");
  await assert.rejects(svgToPdf(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><image x="0" y="0" width="40" height="40" href="https://example.invalid/a.png"/></svg>`, { strict: true }), (error) => error.code === "pdf-image-skipped", "remote pictures are never fetched");
}

console.log("pdf-vector: structure, text round trips, determinism, metadata, fonts and fallbacks passed.");
