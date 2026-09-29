// Optional script font pack (FF-19): pinned, hash-verified OFL Noto faces that
// stand in for proprietary script fonts in previews. The packages are optional
// peers, so the renderer install stays small; hosts install only what they use.
import { BUNDLED_FONT_MANIFEST } from "./font-manifest.js";
import { OPFFontError } from "./fonts.js";
import * as scriptFontModule from "./script-fonts.js";
import { scriptOfCharacter, scriptsOfText } from "./script-fonts.js";
// Optional core exports are read from the namespace so an older published core still loads.
import * as opfCore from "@openpresentation/opf";

const SCRIPT_ALIASES = Object.freeze({Hira: "Jpan", Kana: "Jpan", Hrkt: "Jpan", Hang: "Kore", Hani: "Hans", Zyyy: "Latn"});

/** Script-pack manifest packages serving `scripts` ("all" or ISO 15924 codes such as `Jpan`, `Arab`). */
export function scriptFontPackages(scripts) {
  const available = BUNDLED_FONT_MANIFEST.packages.filter(item => item.pack === "scripts");
  if (scripts === "all") return available;
  if (!Array.isArray(scripts)) throw new OPFFontError("invalid-font-scripts", "scripts must be 'all' or an array of ISO 15924 script codes.", {scripts});
  const wanted = new Set();
  for (const value of scripts) {
    const code = typeof value === "string" && /^[A-Za-z]{4}$/.test(value) ? value[0].toUpperCase() + value.slice(1).toLowerCase() : undefined;
    const script = SCRIPT_ALIASES[code] ?? code;
    if (!script || !available.some(item => item.scripts.includes(script))) {
      throw new OPFFontError("font-script-unavailable", `No pinned open font serves script '${value}'.`, {script: value, available: [...new Set(available.flatMap(item => item.scripts))].sort()});
    }
    wanted.add(script);
  }
  return available.filter(item => item.scripts.some(script => wanted.has(script)));
}

/**
 * Browser entries for the script pack. `baseUrl` is where the host serves the
 * installed `@expo-google-fonts/*` packages (for example a copy of
 * `node_modules/@expo-google-fonts`). Each entry carries the reviewed SHA-256,
 * which `loadBrowserFontRegistry` verifies before use.
 */
export function scriptFontEntries(scripts, {baseUrl}) {
  return scriptPackageEntries(scriptFontPackages(scripts), {baseUrl});
}

/** Browser entries for whole manifest packages (see `scriptFontEntries`). */
export function scriptPackageEntries(packages, {baseUrl}) {
  if (typeof baseUrl !== "string" || !baseUrl) throw new OPFFontError("invalid-font-source", "scriptFontEntries requires the baseUrl that serves the installed font packages.");
  const root = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return packages.flatMap(pkg => pkg.faces.map(face => ({
    url: `${root}${pkg.name.split("/").pop()}/${face.file}`,
    family: face.family, weight: face.weight, italic: face.italic, sha256: face.sha256,
    scripts: [...pkg.scripts], package: `${pkg.name}@${pkg.version}`, license: pkg.license,
    // A script face is embedded in a standalone SVG only when the slide's text uses its family.
    embed: "used",
  })));
}

// Fields a preview never draws. Everywhere: the schema URL, embedded assets, catalog records, speaker notes, ids,
// image alt text and sources, links and metadata. Only on the presentation itself: its name (aria-label
// fallback), author, language and version. Everything else is drawn text: titles, text blocks, list items,
// runs, table cells, chart labels, categories and series names, code, quotes, metrics, timelines, furniture.
const UNDRAWN_KEYS = Object.freeze(["$schema", "assets", "catalogs", "notes", "id", "alt", "altText", "src", "url", "href", "link", "metadata"]);
const UNDRAWN_ROOT_KEYS = Object.freeze(["name", "author", "authors", "creator", "language", "license", "version", "keywords"]);
const UNDRAWN_VALUE = /^(?:https?|data|blob|pkg|file|mailto):\S*$/i;

/** The strings a preview of this presentation draws. */
export function* drawnStrings(presentation) {
  const undrawn = new Set(UNDRAWN_KEYS), undrawnRoot = new Set(UNDRAWN_ROOT_KEYS);
  function* visit(item, root) {
    if (typeof item === "string") { if (!UNDRAWN_VALUE.test(item)) yield item; }
    else if (Array.isArray(item)) for (const child of item) yield* visit(child, false);
    else if (item && typeof item === "object") for (const [key, child] of Object.entries(item)) if (!undrawn.has(key) && !(root && undrawnRoot.has(key))) yield* visit(child, false);
  }
  yield* visit(presentation, true);
}

/**
 * The script profile of a presentation: core `resolveScriptFonts` output, exactly what the renderer plans
 * with. When the installed core has none (published core 0.11.0 and earlier) or it throws, the renderer
 * ignores the document language, so the profile is empty and Han text is Simplified Chinese, as drawn.
 */
export function presentationScriptProfile(presentation) {
  if (typeof opfCore.resolveScriptFonts === "function") {
    try { return opfCore.resolveScriptFonts(presentation); } catch { /* the renderer falls back the same way */ }
  }
  return {};
}

const servedScripts = () => new Set(BUNDLED_FONT_MANIFEST.packages.filter(item => item.pack === "scripts").flatMap(item => item.scripts));
const cjkKeys = ["Jpan", "Hans", "Hant", "Kore"];
const cjkCharacters = new Set(["Hani", "Hira", "Kana", "Hang", "Bopo"]);
const greekOrCyrillic = /[Ͱ-Ͽἀ-῿Ѐ-ԯ]/;
/** True when the renderer has per-character glyph fallback (FF-19 glyphFallbackFamilies): a chosen Latin face that lacks Greek or Cyrillic then draws them with Noto Sans. */
const hasGlyphFallback = () => typeof scriptFontModule.glyphFallbackFamilies === "function";

/**
 * What a preview of the presentation draws: its script profile, the scripts of its text (the renderer's own
 * itemization, so language-dependent punctuation counts), and the CJK characters that a glyph fallback might
 * have to draw with another CJK face.
 */
export function analyzePresentationScripts(presentation, profile = presentationScriptProfile(presentation)) {
  const scripts = new Set(), cjk = new Set();
  let greekCyrillicText = false;
  for (const text of drawnStrings(presentation)) {
    for (const script of scriptsOfText(text, profile)) scripts.add(script);
    if (greekOrCyrillic.test(text)) greekCyrillicText = true;
    for (const character of text) if (character.codePointAt(0) > 0x2E7F && cjkCharacters.has(scriptOfCharacter(character))) cjk.add(character);
  }
  // Noto Sans covers Latin, Greek and Cyrillic; the glyph-fallback chain reaches for it when the chosen face lacks a character.
  if (greekCyrillicText && hasGlyphFallback()) scripts.add("Latn");
  return { profile, detected: [...scripts].sort(), cjk };
}

/**
 * Script keys (ISO 15924: `Jpan`, `Hans`, `Arab`, ...) whose faces a preview of this presentation needs.
 * Text decides, itemized exactly as drawing does: the document language only tells Han text apart
 * (Japanese, Korean, Simplified or Traditional Chinese) and makes curly quotes, dashes and the ellipsis
 * East Asian. Text the preview never draws (ids, alt text, sources, assets, catalogs, notes) is ignored.
 * With a renderer that has glyph fallback, Greek or Cyrillic text adds `Latn` (Noto Sans).
 * Pass `profile` to reuse a resolved profile.
 */
export function detectPresentationScripts(presentation, { profile } = {}) {
  return analyzePresentationScripts(presentation, profile).detected;
}

/** The scripts of an analysis that a pinned pack serves (`scripts`, the input for `scriptFontPackages`) and those it does not. */
export function scriptSelectionOf(analysis) {
  const served = servedScripts();
  return { detected: analysis.detected, scripts: analysis.detected.filter(script => served.has(script)), unavailable: analysis.detected.filter(script => !served.has(script)) };
}

/**
 * What `scripts: 'auto'` loads for a presentation: the `detected` scripts, those a pinned pack serves
 * (`scripts`, the input for `scriptFontPackages`) and those it does not (`unavailable`, for example
 * Cherokee or Tifinagh, which draw with whatever the design font covers).
 */
export function autoScriptSelection(presentation, options) {
  return scriptSelectionOf(analyzePresentationScripts(presentation, options?.profile));
}

/**
 * The next CJK package a glyph fallback needs (FF-19): a drawn Han, kana or Hangul character that no loaded
 * script face has (Japanese-only kanji in a Simplified Chinese run, Simplified-only hanzi beside kana, hanja)
 * takes the first unloaded CJK face along the renderer's fallback chain. `covers(character)` says whether a
 * loaded script face has the glyph; `loaded` holds the loaded package names. Undefined when nothing is needed
 * or the renderer has no glyph fallback. Call again after loading it: at most the four CJK packages follow.
 */
export function nextFallbackPackage(analysis, { covers, loaded }) {
  if (!hasGlyphFallback()) return undefined;
  const packages = BUNDLED_FONT_MANIFEST.packages.filter(item => item.pack === "scripts" && item.scripts.some(script => cjkKeys.includes(script)));
  for (const character of analysis.cjk) {
    if (covers(character)) continue;
    for (const family of scriptFontModule.glyphFallbackFamilies(character, analysis.profile, analysis.profile?.serif === true)) {
      const pkg = packages.find(item => !loaded.has(item.name) && item.faces.some(face => face.family === family));
      if (pkg) return pkg;
    }
  }
  return undefined;
}
