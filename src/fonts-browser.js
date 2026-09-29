import { createFontRegistry, OPFFontError } from "./fonts.js";
import { autoScriptSelection, scriptFontPackages, scriptPackageEntries } from "./script-font-pack.js";
export { autoScriptSelection, detectPresentationScripts, scriptFontEntries, scriptFontPackages } from "./script-font-pack.js";

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
  const fetchFaces = (list) => Promise.all(
    list.map(async (entry) => {
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
  const faces = await fetchFaces(entries);
  const registry = createFontRegistry(faces, options),
    loaded = [];
  // Normalize family names using the registry's parsed font metadata.
  const described = registry.describeFaces();
  // Registers browser FontFaces for faces already parsed by the registry; on failure nothing stays registered.
  const registerBrowserFaces = async (list, descriptors) => {
    const added = [];
    try {
      await Promise.all(
        list.map(async (entry, index) => {
          const descriptor = descriptors[index];
          const face = new FontFaceRef(
            descriptor.family,
            entry.data.slice().buffer,
            {
              weight: String(descriptor.weight),
              style: descriptor.italic ? "italic" : "normal",
            },
          );
          await face.load();
          added.push(face);
        }),
      );
      for (const face of added) documentRef.fonts.add(face);
      await documentRef.fonts.ready;
    } catch (error) {
      for (const face of added) documentRef.fonts.delete(face);
      throw new OPFFontError("font-load-failed", error.message);
    }
    loaded.push(...added);
  };
  await registerBrowserFaces(faces, described);

  // Script faces (FF-19) are loaded lazily, once a document needs them, and only for the scripts it uses.
  const scriptPackages = new Set();
  let queue = Promise.resolve();
  const baseUrl = () => {
    if (typeof options.scriptBaseUrl !== "string" || !options.scriptBaseUrl)
      throw new OPFFontError("invalid-font-source", "Loading script fonts requires scriptBaseUrl, where the host serves the installed @expo-google-fonts packages.");
    return options.scriptBaseUrl;
  };
  const loadScriptPackages = (scripts) => {
    const wanted = scriptFontPackages(scripts).filter((item) => !scriptPackages.has(item.name));
    const result = queue.then(async () => {
      const pending = wanted.filter((item) => !scriptPackages.has(item.name));
      if (!pending.length) return [];
      const root = baseUrl();
      const fetched = await fetchFaces(scriptPackageEntries(pending, { baseUrl: root }));
      const descriptors = registry.addFaces(fetched);
      for (const item of pending) scriptPackages.add(item.name);
      await registerBrowserFaces(fetched, descriptors);
      return pending.map((item) => item.name);
    });
    queue = result.catch(() => {});
    return result;
  };
  Object.assign(registry, {
    /** Load the script faces for explicit ISO 15924 codes (or 'all'). Resolves with the newly loaded package names. */
    loadScripts: (scripts) => loadScriptPackages(scripts),
    /**
     * Load the script faces the presentation's text needs, once each (FF-19). Cheap when nothing new is
     * needed; call it after edits and render again afterwards. Resolves with the detected scripts, the
     * packages loaded by this call and the scripts no pinned font serves.
     */
    async ensureScripts(presentation) {
      const selection = autoScriptSelection(presentation);
      const loadedNow = selection.scripts.length ? await loadScriptPackages(selection.scripts) : [];
      return { ...selection, loaded: loadedNow };
    },
  });
  /** Names of the script-pack packages loaded so far. */
  Object.defineProperty(registry, "loadedScriptPackages", { get: () => [...scriptPackages], enumerable: true });
  try {
    if (options.scripts === "auto") {
      if (options.presentation === null || typeof options.presentation !== "object")
        throw new OPFFontError("invalid-font-scripts", "scripts: 'auto' needs the presentation whose text decides the scripts.", { scripts: options.scripts });
      await registry.ensureScripts(options.presentation);
    } else if (options.scripts !== undefined && !(Array.isArray(options.scripts) && !options.scripts.length)) {
      await registry.loadScripts(options.scripts);
    }
  } catch (error) {
    for (const face of loaded) documentRef.fonts.delete(face);
    throw error;
  }
  return Object.assign(registry, {
    dispose() {
      for (const face of loaded) documentRef.fonts.delete(face);
    },
  });
}
