import type {FontRegistry,FontRegistryOptions,EmbeddedFont,FontFaceInput} from "./fonts.js";
/** A caller-supplied face (FF-31), for example a licensed copy of the real font. Node callers may pass a file path. */
export type CallerFontFace = FontFaceInput | (Omit<FontFaceInput, "data"> & {path: string});
/** "all" or ISO 15924 codes (`Jpan`, `Hans`, `Hant`, `Kore`, `Arab`, `Hebr`, `Deva`, `Thai`, ...). */
export type ScriptSelection = "all" | string[];
export interface ScriptPackOptions {
  /** Caller-supplied faces, loaded first so a licensed real font resolves as an exact face (FF-31). */
  faces?: readonly CallerFontFace[];
  /** Also load the optional, hash-pinned OFL Noto script pack for these scripts (FF-19). */
  scripts?: ScriptSelection;
}
export declare function loadBundledFontRegistry(options?: FontRegistryOptions & ScriptPackOptions): Promise<FontRegistry & {fontFiles:string[]}>;

export declare function loadOfficeFontRegistry(options?: FontRegistryOptions & ScriptPackOptions & {includeBaseFonts?:boolean; /** Leave out the open families font schemes select (FF-31); default true. */ includeOpenFonts?:boolean}): Promise<FontRegistry & {fontFiles:string[]}>;

export type BundledFontPackage = Readonly<{
  name:string; version:string; pack:"base"|"office"|"open"|"scripts"; source:string;
  /** ISO 15924 scripts served by a script-pack package. */
  scripts?: readonly string[];
  license:string; licenseFile:string; licenseSha256:string;
  /** Whether the shipped notice declares a Reserved Font Name, and which (read from the notice, never assumed). */
  hasReservedFontName:boolean; reservedFontNames:readonly string[];
  /** The family this package is the renamed successor of; requests for the old name draw these faces, reported visual. */
  renamedFrom?:string;
  /** Open pack: the directory inside this package holding the vendored faces, notice and PROVENANCE.json; `file` and `licenseFile` are relative to it. */
  vendored?:string; upstreamLicenseFile?:string;
  faces:readonly Readonly<{file:string; family:string; weight:number; italic:boolean; sha256:string; upstreamFile?:string}>[];
}>;
export interface BundledFontManifest {
  readonly version: number;
  readonly packages: readonly BundledFontPackage[];
}
export declare const BUNDLED_FONT_MANIFEST: BundledFontManifest;
export declare function scriptFontPackages(scripts: ScriptSelection): BundledFontPackage[];
export interface PreparedNodeFonts {
  registry: FontRegistry & {fontFiles:string[]};
  manifest: BundledFontManifest;
  options: {
    textMeasurement: FontRegistry["textMeasurement"];
    embeddedFonts: EmbeddedFont[];
    fontFiles: string[];
    useBundledFonts: false;
    loadSystemFonts: false;
  };
}
export declare function prepareNodeFonts(options?: FontRegistryOptions & ScriptPackOptions & {pack?:"base"|"office"; includeBaseFonts?:boolean; /** With pack "office": leave out the open families (FF-31); default true. */ includeOpenFonts?:boolean; /** Embed script faces in SVG (large); default false. */ embedScriptFonts?:boolean; /** Embed the open families in SVG (about 9 MiB); default false, raster reads them from fontFiles. */ embedOpenFonts?:boolean}): Promise<PreparedNodeFonts>;
