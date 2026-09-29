// FF-31: shared license detection for bundled font packages. Used by scripts/update-font-manifest.mjs
// (to write manifest fields) and test/font-licenses.mjs (to verify them). Matching is deliberately simple:
// each license is recognised by its own standard title or grant text in the file the package ships.

/** Licenses a bundled font may carry (owner decision 2026-09-29). Bitstream-Vera covers the Vera/DejaVu-style permissive grant. */
export const ALLOWED_FONT_LICENSES = Object.freeze(['OFL-1.1', 'Apache-2.0', 'MIT', 'UFL-1.0', 'Bitstream-Vera']);

const DETECTORS = [
  ['OFL-1.1', /SIL\s+OPEN\s+FONT\s+LICEN[CS]E,?\s+Version\s+1\.1/i],
  ['Apache-2.0', /Apache\s+License,?\s+Version\s+2\.0/i],
  ['UFL-1.0', /UBUNTU\s+FONT\s+LICEN[CS]E,?\s+Version\s+1\.0/i],
  ['Bitstream-Vera', /Bitstream\s+Vera[\s\S]{0,4000}Permission\s+is\s+hereby\s+granted,\s+free\s+of\s+charge,\s+to\s+any\s+person\s+obtaining\s+a\s+copy\s+of\s+the\s+fonts/i],
  ['MIT', /Permission\s+is\s+hereby\s+granted,\s+free\s+of\s+charge,\s+to\s+any\s+person\s+obtaining\s+a\s+copy\s+of\s+this\s+software[\s\S]{0,1500}THE\s+SOFTWARE\s+IS\s+PROVIDED\s+"AS\s+IS"/i],
  // Recognised only so that a copyleft or unclear font fails with a clear name.
  ['AGPL', /GNU\s+AFFERO\s+GENERAL\s+PUBLIC\s+LICENSE/i],
  ['LGPL', /GNU\s+(?:LESSER|LIBRARY)\s+GENERAL\s+PUBLIC\s+LICENSE/i],
  ['GPL', /GNU\s+GENERAL\s+PUBLIC\s+LICENSE/i],
];

/** SPDX-style ids found in a license text: one entry per recognised license, in detector order. */
export function detectLicenses(text) {
  return DETECTORS.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
}

/** The single license a font license file grants, or null when the text is unrecognised or mixes licenses. */
export function detectLicense(text) {
  const found = detectLicenses(text);
  return found.length === 1 ? found[0] : null;
}

// The copyright block precedes the license title. "Reserved Font Name" also appears in the OFL body as a
// definition, so only the block before the license title counts.
function licenseHeader(text) {
  const boundary = text.search(/-{10,}\s*\r?\n\s*SIL\s+OPEN\s+FONT\s+LICEN[CS]E|-{10,}\s*\r?\n\s*Apache|-{10,}\s*\r?\n\s*UBUNTU/i);
  return boundary === -1 ? text.slice(0, 4000) : text.slice(0, boundary);
}

/** Reserved Font Names declared in the copyright block (empty when none). RFN only restricts modified versions. */
export function reservedFontNames(text) {
  const names = [];
  const clause = /with\s+Reserved\s+Font\s+Names?\s*[:=]?\s*((?:["“'‘][^"”'’\n]+["”'’](?:\s*(?:,|and|&)\s*)?)+)/gi;
  for (const match of licenseHeader(text).matchAll(clause)) {
    for (const quoted of match[1].matchAll(/["“'‘]([^"”'’\n]+)["”'’]/g)) names.push(quoted[1].trim());
  }
  return [...new Set(names)].sort();
}

/** First upstream project URL named in the copyright block, or null. */
export function upstreamUrl(text) {
  return /https?:\/\/[^\s)>"']+/.exec(licenseHeader(text))?.[0].replace(/[.,;]+$/, '') ?? null;
}

/** First non-empty line of the license file (the copyright statement). */
export function copyrightLine(text) {
  return text.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? null;
}
