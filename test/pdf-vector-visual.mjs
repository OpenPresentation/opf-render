// RR-12: appearance of the vector PDF against the PNG preview, on the installed core example corpus.
// Each slide is exported to a vector PDF, rasterized independently (pdf.js + @napi-rs/canvas) and compared with the
// resvg PNG preview of the same SVG at the same size, after averaging 2x2 pixels (anti-aliasing differs between
// rasterizers; geometry, colour and clipping must not). Usage: node test/pdf-vector-visual.mjs [--all] [--report file]
//   default: every OPF_PDF_VISUAL_STEP-th slide (16), --all: every slide (about ten minutes).
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { examples } from "@openpresentation/opf/examples";
import { renderSvgDeck, svgToPdf, svgToPng } from "../dist/index.js";
import { loadOfficeFontRegistry } from "../dist/fonts-node.js";
import { compareImages, openPdf, percentile, renderPdfPage } from "./pdf-helpers.mjs";

const all = process.argv.includes("--all");
const reportIndex = process.argv.indexOf("--report");
const report = reportIndex > 0 ? process.argv[reportIndex + 1] : null;
const step = all ? 1 : Number(process.env.OPF_PDF_VISUAL_STEP ?? 16);
// Declared tolerances (mean absolute channel error and share of clearly different pixels, at half size).
const MAX_MAE = 1.5, MAX_LARGE_PERCENT = 0.5;

const fonts = await loadOfficeFontRegistry({ substitutionPolicy: "visual", scripts: "all" });
const options = { fontFiles: fonts.fontFiles, useBundledFonts: false };
// Only the selected slides keep their SVG (each carries its embedded fonts, so the whole corpus would not fit in memory).
const slides = [];
let corpusSlides = 0;
for (const { file, deck } of [...examples].sort((a, b) => (a.file < b.file ? -1 : 1))) {
  const svgs = renderSvgDeck(deck, { trace: true, textMeasurement: fonts.textMeasurement, embeddedFonts: fonts.embeddedFonts });
  svgs.forEach((svg, index) => {
    if (corpusSlides++ % step === 0) slides.push({ key: `${file.replace(/^examples\//, "")}#${index}`, svg });
  });
}

const rows = [];
let vectorBytes = 0, rasterBytes = 0, vectorMs = 0;
for (let index = 0; index < slides.length; index++) {
  const { key, svg } = slides[index];
  const notes = [];
  const started = performance.now();
  const pdf = await svgToPdf([svg], { ...options, onDiagnostic: (d) => { if (!/^pdf-font-(embedded|fallback|substituted)$/.test(d.code)) notes.push(d.code); } });
  vectorMs += performance.now() - started;
  const doc = await openPdf(pdf);
  const rendered = await renderPdfPage(doc, 1);
  const preview = await svgToPng(svg, options);
  const { mae, largePercent } = await compareImages(rendered.png, preview);
  vectorBytes += pdf.length;
  rasterBytes += (await svgToPdf([svg], { ...options, mode: "raster" })).length;
  rows.push({ key, mae, largePercent, bytes: pdf.length, notes });
}

const maes = rows.map((row) => row.mae).sort((a, b) => a - b);
const larges = rows.map((row) => row.largePercent).sort((a, b) => a - b);
const summary = {
  slides: rows.length, corpusSlides, step,
  mae: { p50: percentile(maes, 0.5), p90: percentile(maes, 0.9), p99: percentile(maes, 0.99), max: maes.at(-1) },
  largePixelPercent: { p50: percentile(larges, 0.5), p90: percentile(larges, 0.9), p99: percentile(larges, 0.99), max: larges.at(-1) },
  pdfBytes: { vectorMean: Math.round(vectorBytes / rows.length), rasterMean: Math.round(rasterBytes / rows.length) },
  vectorExportMsPerSlide: Math.round(vectorMs / rows.length),
  fallbackNotes: [...new Set(rows.flatMap((row) => row.notes))],
  tolerances: { maxMae: MAX_MAE, maxLargePercent: MAX_LARGE_PERCENT },
};
if (report) {
  mkdirSync(path.dirname(path.resolve(report)), { recursive: true });
  writeFileSync(report, JSON.stringify({ summary, rows }, null, 1) + "\n");
}
console.log(JSON.stringify(summary));
const worst = [...rows].sort((a, b) => b.mae - a.mae).slice(0, 3).map((row) => `${row.key} mae=${row.mae.toFixed(2)} large=${row.largePercent.toFixed(2)}%`);
assert.ok(maes.at(-1) <= MAX_MAE, `mean error above ${MAX_MAE}: ${worst.join("; ")}`);
assert.ok(larges.at(-1) <= MAX_LARGE_PERCENT, `large-difference pixels above ${MAX_LARGE_PERCENT}%: ${worst.join("; ")}`);
console.log(`pdf-vector-visual: ${rows.length} of ${corpusSlides} slides within tolerance (median MAE ${summary.mae.p50.toFixed(3)}, worst ${summary.mae.max.toFixed(3)}).`);
