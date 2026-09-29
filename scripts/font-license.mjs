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

/** True when the copyright block says "with Reserved Font Name", however the names are quoted. Catches what reservedFontNames() cannot parse. */
export function declaresReservedFontName(text) {
  return /with\s+Reserved\s+Font\s+Names?/i.test(licenseHeader(text));
}

/**
 * A family whose license declares a Reserved Font Name must be bundled as the unmodified files its copyright holder
 * released (owner decision, 2026-09-29): a subset, instance, conversion or edit is a modified version and may not carry the
 * name. A face proves this with `upstreamFile: { url, sha256 }`, where `sha256` equals the face's own sha256 (byte-identical)
 * and `url` is one of these pinned sources.
 */
/** Repositories whose files count as the copyright holder's release. Adding one is a reviewed change. */
export const UNMODIFIED_UPSTREAM_REPOSITORIES = Object.freeze(['google/fonts']);

/** A pinned raw file (commit sha in the URL) or a release asset of an allowlisted repository. */
export function isUnmodifiedUpstreamUrl(url) {
  const match = /^https:\/\/raw\.githubusercontent\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/[0-9a-f]{40}\/\S+\.(?:ttf|otf)$/.exec(url) ?? /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/releases\/download\/\S+\.(?:ttf|otf)$/.exec(url);
  return Boolean(match) && UNMODIFIED_UPSTREAM_REPOSITORIES.includes(match[1]);
}

/**
 * Packages that declare a Reserved Font Name but do not yet ship unmodified upstream files, each with why. The renderer's
 * @expo-google-fonts files are the Google Fonts API distribution (Carlito: 2532 glyphs against 2783 in the google/fonts
 * file, so it is a subset) or static instances of a variable font (Noto Sans CJK: 5.4 MB against a 9.6 MB variable file).
 * This list may only shrink: test/font-licenses.mjs fails on a stale entry and on any new RFN package that is not listed.
 */
export const RFN_PENDING_UNMODIFIED_UPSTREAM = Object.freeze({
  '@expo-google-fonts/carlito': 'Google Fonts API subset of the google/fonts Carlito files (fewer glyphs); switch to the google/fonts TTFs.',
  '@expo-google-fonts/noto-sans-jp': 'Static instances generated from the google/fonts variable font; upstream ships only NotoSansJP[wght].ttf.',
  '@expo-google-fonts/noto-sans-sc': 'Static instances generated from the google/fonts variable font; upstream ships only NotoSansSC[wght].ttf.',
  '@expo-google-fonts/noto-sans-tc': 'Static instances generated from the google/fonts variable font; upstream ships only NotoSansTC[wght].ttf.',
  '@expo-google-fonts/noto-sans-kr': 'Static instances generated from the google/fonts variable font; upstream ships only NotoSansKR[wght].ttf.',
});
