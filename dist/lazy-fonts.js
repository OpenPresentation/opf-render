import { fontPolicyFor } from "./font-policy.js";
import { resolvePresentation } from "./svg.js";
export { lazyFontEntries, lazyFontList } from "./lazy-font-list.js";

/**
 * FF-31: the vendored faces (the open families and Intos) are not in a registry's eager list. Browser hosts load them
 * on demand, from separate hash-pinned files, when a document's font families resolve to them. This module holds the
 * pure parts (which faces exist, which a presentation needs); fonts-browser.js does the fetching.
 */

const lc = value => String(value).trim().toLowerCase();

/** The font families a presentation's slides resolve (heading, body and code roles), or an empty set for a document that does not resolve. */
export function presentationFamilies(presentation) {
  const families = new Set();
  let resolved;
  try { resolved = resolvePresentation(presentation, {}); } catch { return families; }
  for (const slide of resolved.slides) for (const family of Object.values(slide.design?.fonts ?? {})) if (typeof family === "string" && family) families.add(family);
  return families;
}

/**
 * The vendored faces a document needs that the registry does not hold, following the registry's own order:
 * the family itself, a renamed predecessor, then the policy replacement and its alternates. The first candidate the
 * registry already has ends the search (it will resolve to that); the first vendored candidate is loaded, whole
 * family, so the browser resolves exactly what Node resolves with everything loaded.
 * @param {Iterable<string>} families families the document resolves
 * @param {{lazy: readonly object[], hasFamily: (family: string) => boolean, loaded?: ReadonlySet<string>}} context
 */
export function lazyFontsFor(families, { lazy, hasFamily, loaded = new Set() }) {
  const byFamily = new Map();
  for (const face of lazy) { const list = byFamily.get(lc(face.family)) ?? []; list.push(face); byFamily.set(lc(face.family), list); }
  const renamed = new Map(lazy.filter(face => face.renamedFrom).map(face => [lc(face.renamedFrom), face.family]));
  const needed = new Set();
  for (const family of families) {
    const row = fontPolicyFor(family);
    const route = [family, renamed.get(lc(family)), row?.replacement?.family, ...(row?.alternates ?? [])].filter(Boolean);
    for (const candidate of route) {
      if (hasFamily(candidate)) break;
      if (byFamily.has(lc(candidate))) { needed.add(lc(candidate)); break; }
    }
  }
  return [...needed].flatMap(family => byFamily.get(family)).filter(face => !loaded.has(face.file));
}
