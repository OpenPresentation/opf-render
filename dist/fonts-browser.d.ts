import type {
  FontFaceInput,
  FontRegistry,
  FontRegistryOptions,
} from "./fonts.js";
import type { BundledFontPackage, LazyFont, ScriptSelection } from "./fonts-node.js";
export type { LazyFont } from "./fonts-node.js";
export interface BrowserFontRegistry extends FontRegistry {
  dispose(): void;
  /** Every vendored face a host can load on demand. */
  readonly lazyFonts: readonly LazyFont[];
  /**
   * Load the vendored faces the presentation's font families resolve to (for example Intos for the default Aptos scheme),
   * once each, from `lazyFontsBaseUrl`. Fetches and verifies every file, then adds the faces to the document and the registry
   * together; on failure nothing changes and the call can be retried. Call it before measuring a document. After
   * `dispose()` it rejects with `font-registry-disposed`.
   */
  ensureLazyFonts(presentation: unknown, options?: { signal?: AbortSignal }): Promise<LazyFont[]>;
  /** Synchronous: the vendored faces the presentation needs that are not loaded yet. Empty means `ensureLazyFonts` fetches nothing. */
  pendingLazyFonts(presentation: unknown): LazyFont[];
}
/** Every vendored face of this package: family, style, package-relative file, sha256. */
export declare function lazyFontList(): readonly LazyFont[];
/** Hash-pinned browser entries for the vendored faces, served by the host from `baseUrl` at their package-relative paths. */
export declare function lazyFontEntries(options: { baseUrl: string }, list?: readonly LazyFont[]): (BrowserFontInput & { url: string; family: string; weight: number; italic: boolean; sha256: string; package: string })[];
/** The font families a presentation's slides resolve (heading, body and code roles); empty for a document that does not resolve. */
export declare function presentationFamilies(presentation: unknown): Set<string>;
/** The vendored faces a set of resolved families needs that the registry does not hold. */
export declare function lazyFontsFor(families: Iterable<string>, context: { lazy: readonly LazyFont[]; hasFamily(family: string): boolean; loaded?: ReadonlySet<string> }): LazyFont[];
export interface BrowserFontInput extends Omit<FontFaceInput, "data"> {
  data?: Uint8Array;
  url?: string;
  /** Reviewed SHA-256 (hex); verified with Web Crypto before the face is used. */
  sha256?: string;
}
export declare function loadBrowserFontRegistry(
  entries: BrowserFontInput[],
  options?: FontRegistryOptions & {
    document?: Document;
    fetch?: typeof fetch;
    signal?: AbortSignal;
    crypto?: { subtle: SubtleCrypto };
    /** Where the host serves this package's `fonts` directory, so vendored faces load on demand from `<base>/<package-relative file>` (fonts/intos/..., fonts/open/...). */
    lazyFontsBaseUrl?: string;
  },
): Promise<BrowserFontRegistry>;
export declare function scriptFontPackages(scripts: ScriptSelection): BundledFontPackage[];
/** Hash-pinned browser entries for the script pack, served by the host from `baseUrl`. */
export declare function scriptFontEntries(
  scripts: ScriptSelection,
  options: { baseUrl: string },
): (BrowserFontInput & { url: string; family: string; weight: number; italic: boolean; sha256: string; scripts: string[]; package: string; license: string })[];
