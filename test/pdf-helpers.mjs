// Independent PDF reading for the vector PDF tests (RR-12): pdf.js (Apache-2.0) extracts text and rasterizes pages,
// so the checks do not depend on the writer's own model of the file.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";

export async function openPdf(bytes) {
  return pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0, useSystemFonts: false }).promise;
}

/** The text items of a page in the order pdf.js reports them (content order), each {str, dir}. */
export async function pageItems(doc, pageNumber) {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items.filter((item) => typeof item.str === "string");
}

export async function pageText(doc, pageNumber) {
  const items = await pageItems(doc, pageNumber);
  return items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
}

/** Render a page at scale 1 (1 PDF point = 1 pixel) on white; returns {png, width, height}. */
export async function renderPdfPage(doc, pageNumber, scale = 1) {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  return { png: canvas.toBuffer("image/png"), width: canvas.width, height: canvas.height };
}

/**
 * Compare two PNGs of equal size after averaging down by `factor` (anti-aliasing differs between rasterizers, geometry
 * must not). Returns the mean absolute channel error (0-255) and the percentage of pixels whose largest channel
 * difference exceeds `threshold`.
 */
export async function compareImages(a, b, { factor = 2, threshold = 48 } = {}) {
  const sizeA = await sharp(a).metadata(), sizeB = await sharp(b).metadata();
  if (sizeA.width !== sizeB.width || sizeA.height !== sizeB.height) throw new Error(`Image sizes differ: ${sizeA.width}x${sizeA.height} vs ${sizeB.width}x${sizeB.height}`);
  const width = Math.round(sizeA.width / factor), height = Math.round(sizeA.height / factor);
  const prepare = (image) => sharp(image).removeAlpha().resize(width, height, { kernel: "lanczos3" }).raw().toBuffer();
  const [left, right] = await Promise.all([prepare(a), prepare(b)]);
  let sum = 0, large = 0;
  const pixels = left.length / 3;
  for (let pixel = 0; pixel < pixels; pixel++) {
    let largest = 0;
    for (let channel = 0; channel < 3; channel++) {
      const difference = Math.abs(left[pixel * 3 + channel] - right[pixel * 3 + channel]);
      sum += difference;
      if (difference > largest) largest = difference;
    }
    if (largest > threshold) large++;
  }
  return { mae: sum / left.length, largePercent: 100 * large / pixels };
}

export function percentile(sortedValues, fraction) {
  if (!sortedValues.length) return 0;
  return sortedValues[Math.min(sortedValues.length - 1, Math.floor(fraction * (sortedValues.length - 1) + 0.5))];
}

/**
 * The page text per structure block (one marked-content sequence per SVG text element, so one block is one source line)
 * in content order. pdf.js reports glyph runs left to right as drawn (visual order); a block of a right-to-left paragraph
 * is read from its right-most run, so its runs are joined by descending x when `rtl` is set. Text outside any
 * structure block (artifacts such as bullets) is its own block.
 */
export async function pageBlocks(doc, pageNumber, { rtl = false } = {}) {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent({ includeMarkedContent: true });
  const blocks = [];
  let current = null, depth = 0, blockDepth = -1;
  const flush = () => {
    if (!current) return;
    const items = current.sort((a, b) => (rtl ? b.transform[4] - a.transform[4] : 0)).map((item) => item.str);
    blocks.push(items.join(" ").replace(/\s+/g, " ").trim());
    current = null;
  };
  for (const item of content.items) {
    if (item.type === "beginMarkedContentProps") {
      depth++;
      if (item.tag !== "Span" && current === null && item.id) { current = []; blockDepth = depth; }
    } else if (item.type === "endMarkedContent") {
      if (current && depth === blockDepth) { flush(); blockDepth = -1; }
      depth--;
    } else if (typeof item.str === "string") {
      if (current) current.push(item); else blocks.push(item.str.trim());
    }
  }
  flush();
  return blocks.filter(Boolean);
}
