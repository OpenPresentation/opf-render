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
/** A vendored face (the open families and Intos): embedded in an SVG only when its text names the family, and loaded on demand by browser hosts from a separate hash-pinned file. */
export interface LazyFont { readonly package: string; readonly family: string; readonly weight: number; readonly italic: boolean; /** Path relative to the package root, for example fonts/intos/Intos-Regular.ttf. */ readonly file: string; readonly sha256: string; readonly license: string; readonly renamedFrom?: string }
export type NodeFontRegistry = FontRegistry & {fontFiles:string[]; /** The vendored (embed "used") faces this registry holds, with the files a host copies to serve them itself. */ lazyFonts: readonly LazyFont[]};
export declare function loadBundledFontRegistry(options?: FontRegistryOptions & ScriptPackOptions): Promise<NodeFontRegistry>;

export declare function loadOfficeFontRegistry(options?: FontRegistryOptions & ScriptPackOptions & {includeBaseFonts?:boolean; /** Leave out the open families font schemes select (FF-31); default true. */ includeOpenFonts?:boolean}): Promise<NodeFontRegistry>;

export type BundledFontPackage = Readonly<{
  name:string; version:string; pack:"base"|"office"|"open"|"scripts"; source:string;
  /** Vendored packages ship inside this package under `directory` (`file` and `licenseFile` are relative to it, with a generated PROVENANCE.json), instead of as a separate npm package. `commit` pins a git upstream. */
  vendored?:boolean; directory?:string; commit?:string;
  /** An authored provenance and copyright notice in `directory`, hash-pinned beside the license and appended to it. */
  noticeFile?:string; noticeSha256?:string;
  /** ISO 15924 scripts served by a script-pack package. */
  scripts?: readonly string[];
  license:string; licenseFile:string; licenseSha256:string;
  /** Vendored from a commit: the commit-pinned URL of the upstream license notice. Vendored from npm: the notice's path in the package. */
  upstreamLicenseUrl?:string; npmLicenseFile?:string;
  /** The family this package is the renamed successor of; requests for the old name draw these faces, reported visual. */
  renamedFrom?:string;
  /** Reserved Font Names declared in the license's copyright block (empty when none), the upstream project URL and the copyright line. */
  reservedFontNames:readonly string[]; upstream:string; copyright:string;
  /** `upstreamFile`: the copyright holder's byte-identical file at a pinned commit (sha256 equals the face's own). `npmFile`: the file's path in the npm package it was vendored from. */
  faces:readonly Readonly<{file:string; family:string; weight:number; italic:boolean; sha256:string; upstreamFile?:Readonly<{url:string; sha256:string}>; npmFile?:string}>[];
}>;
export interface BundledFontManifest {
  readonly version: number;
  readonly packages: readonly BundledFontPackage[];
}
export declare const BUNDLED_FONT_MANIFEST: BundledFontManifest;
export declare function scriptFontPackages(scripts: ScriptSelection): BundledFontPackage[];
export interface PreparedNodeFonts {
  registry: NodeFontRegistry;
  manifest: BundledFontManifest;
  options: {
    textMeasurement: FontRegistry["textMeasurement"];
    embeddedFonts: EmbeddedFont[];
    fontFiles: string[];
    useBundledFonts: false;
    loadSystemFonts: false;
  };
}
export declare function prepareNodeFonts(options?: FontRegistryOptions & ScriptPackOptions & {pack?:"base"|"office"; includeBaseFonts?:boolean; /** With pack "office": leave out the open families (FF-31); default true. */ includeOpenFonts?:boolean; /** Embed script faces in SVG (large); default false. */ embedScriptFonts?:boolean;}): Promise<PreparedNodeFonts>;
