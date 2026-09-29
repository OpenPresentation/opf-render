import { createFontRegistry, OPFFontError } from "./fonts.js";
import { lazyFontEntries, lazyFontList } from "./lazy-font-list.js";
import { lazyFontsFor, presentationFamilies } from "./lazy-fonts.js";
export { lazyFontEntries, lazyFontList } from "./lazy-font-list.js";
export { lazyFontsFor } from "./lazy-fonts.js";
export { scriptFontEntries, scriptFontPackages } from "./script-font-pack.js";

async function verifyDigest(entry, data, subtle) {
  if (entry.sha256 === undefined) return;
  if (!subtle?.digest)
    throw new OPFFontError("font-api-unavailable", "Verifying a font SHA-256 requires Web Crypto.");
  const digest = new Uint8Array(await subtle.digest("SHA-256", data));
  const actual = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actual !== String(entry.sha256).toLowerCase())
    throw new OPFFontError(
      "font-integrity-mismatch",
      "The font file differs from its reviewed SHA-256; serve the pinned package.",
      { url: entry.url, expected: entry.sha256, actual },
    );
}

/** Fetch only host-selected font files, then use those exact bytes for shaping and CSS. */
export async function loadBrowserFontRegistry(entries, options = {}) {
  const documentRef = options.document ?? globalThis.document;
  const FontFaceRef = documentRef?.defaultView?.FontFace ?? globalThis.FontFace;
  if (!documentRef?.fonts || !FontFaceRef)
    throw new OPFFontError(
      "font-api-unavailable",
      "The browser Font Loading API is required.",
    );
  const fetcher = options.fetch ?? globalThis.fetch;
  const subtle = options.crypto?.subtle ?? globalThis.crypto?.subtle;
  const faces = await Promise.all(
    entries.map(async (entry) => {
      let loaded = entry;
      if (!entry.data) {
        if (!entry.url)
          throw new OPFFontError(
            "invalid-font-source",
            "Supply font bytes or a font-file URL.",
          );
        const response = await fetcher(entry.url, { signal: options.signal });
        if (!response.ok)
          throw new OPFFontError(
            "font-fetch-failed",
            `Could not load font (${response.status}).`,
            { url: entry.url },
          );
        loaded = { ...entry, data: new Uint8Array(await response.arrayBuffer()) };
      }
      // Script-pack entries carry the reviewed hash (FF-19); verify before use.
      await verifyDigest(entry, loaded.data, subtle);
      return loaded;
    }),
  );
  const registry = createFontRegistry(faces, options),
    loaded = [];
  // Normalize family names using the registry's parsed font metadata.
  const described = registry.describeFaces();
  try {
    await Promise.all(
      faces.map(async (entry, index) => {
        const descriptor = described[index];
        const face = new FontFaceRef(
          descriptor.family,
          entry.data.slice().buffer,
          {
            weight: String(descriptor.weight),
            style: descriptor.italic ? "italic" : "normal",
          },
        );
        await face.load();
        loaded.push(face);
      }),
    );
    for (const face of loaded) documentRef.fonts.add(face);
    await documentRef.fonts.ready;
  } catch (error) {
    for (const face of loaded) documentRef.fonts.delete(face);
    throw new OPFFontError("font-load-failed", error.message);
  }
  // FF-31: vendored faces (the open families and Intos) load on demand, once a document needs them.
  const lazy = lazyFontList(), lazyLoaded = new Set();
  let queue = Promise.resolve(), disposed = false;
  const gone = () => new OPFFontError("font-registry-disposed", "The font registry was disposed.");
  const hasFamily = (family) => registry.describeFaces().some((face) => face.family.toLowerCase() === String(family).toLowerCase());
  const needed = (presentation) => lazyFontsFor(presentationFamilies(presentation), { lazy, hasFamily, loaded: lazyLoaded });
  const baseUrl = () => {
    if (typeof options.lazyFontsBaseUrl !== "string" || !options.lazyFontsBaseUrl)
      throw new OPFFontError("invalid-font-source", "Loading vendored fonts requires lazyFontsBaseUrl, where the host serves the package's fonts directory.");
    return options.lazyFontsBaseUrl;
  };
  Object.assign(registry, {
    /** Every vendored face a host can load on demand: family, style, package-relative file and pinned sha256. */
    lazyFonts: lazy,
    /**
     * Load the vendored faces the presentation's font families resolve to, once each. Order matters: fetch and verify every
     * file, load every FontFace (not yet visible to the document), then register them with the document and add them to
     * the registry together, so measurement and painting never disagree. On any failure (fetch, hash, FontFace.load,
     * registry) the document and registry are unchanged and the call can be retried. Cheap when nothing is needed. Call it
     * before measuring a document, and again after edits that change fonts. Resolves with the faces added.
     */
    ensureLazyFonts(presentation, callOptions = {}) {
      const result = queue.then(async () => {
        if (disposed) throw gone();
        callOptions.signal?.throwIfAborted?.();
        const pending = needed(presentation);
        if (!pending.length) return [];
        const fetched = await Promise.all(lazyFontEntries({ baseUrl: baseUrl() }, pending).map(async (entry) => {
          const response = await fetcher(entry.url, { signal: callOptions.signal });
          if (!response.ok) throw new OPFFontError("font-fetch-failed", `Could not load font (${response.status}).`, { url: entry.url });
          const data = new Uint8Array(await response.arrayBuffer());
          await verifyDigest(entry, data, subtle);
          return { ...entry, data, embed: "used" };
        }));
        let browserFaces;
        try {
          browserFaces = await Promise.all(fetched.map(async (entry) => {
            const face = new FontFaceRef(entry.family, entry.data.slice().buffer, { weight: String(entry.weight), style: entry.italic ? "italic" : "normal" });
            await face.load();
            return face;
          }));
        } catch (error) { throw new OPFFontError("font-load-failed", error.message); }
        if (disposed) throw gone();
        const shown = [];
        try {
          for (const face of browserFaces) { documentRef.fonts.add(face); shown.push(face); }
          registry.addFaces(fetched);
        } catch (error) {
          for (const face of shown) documentRef.fonts.delete(face);
          throw error;
        }
        loaded.push(...browserFaces);
        for (const item of pending) lazyLoaded.add(item.file);
        try { await documentRef.fonts.ready; } catch { /* the faces are loaded and registered */ }
        return pending;
      });
      queue = result.catch(() => {});
      return result;
    },
    /** Synchronous: the vendored faces the presentation needs that are not loaded yet. Empty means `ensureLazyFonts` fetches nothing. */
    pendingLazyFonts: (presentation) => needed(presentation),
  });
  return Object.assign(registry, {
    dispose() {
      disposed = true;
      for (const face of loaded) documentRef.fonts.delete(face);
    },
  });
}
