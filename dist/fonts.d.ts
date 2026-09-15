import type { TextMeasurement, TextStyle } from "@openpresentation/opf/composition";
import type { FontShaper, ShapedText } from './font-shaping.js';
export interface FontFaceInput { data: Uint8Array; family?: string; weight?: number; italic?: boolean; postscriptName?: string; license?: string }
export interface EmbeddedFont { family: string; weight: number; italic?: boolean; dataUrl: string; license?: string; /** Original bytes retained when browser compatibility requires a reconstructed face. */ sourceDataUrl?: string }
export type FontCompatibility = "exact" | "metric" | "visual" | "generic";
export interface FontResolution { requestedFamily:string; sourceFamily:string; resolvedFamily:string; requestedWeight:number; resolvedWeight:number; italic:boolean; compatibility:FontCompatibility; fontFace?:TextStyle['fontFace']; path?:string; source?:string; note?:string }
export interface FontRegistryOptions {
  /** Prepared opt-in backend; omit to retain current Fontkit measurement. */
  fontShaper?: FontShaper;
  /** Limit selected-face extraction and opt-in font decoding (default 64 MiB). */
  maxPreparedFontBytes?: number;
  aliases?: Record<string,string>; fallbackFamily?: string; strictGlyphs?: boolean;
  substitutionPolicy?: "none" | "metric" | "visual";
  themeFonts?: Partial<Record<"majorLatin"|"minorLatin"|"majorEastAsia"|"minorEastAsia"|"majorComplexScript"|"minorComplexScript",string>>;
}
export declare const FONT_COMPATIBILITY: readonly Readonly<{requestedFamily:string;substitutes:readonly string[];compatibility:"metric"|"visual";weights?:readonly number[];source?:string;note:string}>[];
export declare const EXPERIMENTAL_FONT_CANDIDATES: readonly Readonly<{requestedFamily:string;substitute:string;source:string;note:string}>[];
export interface FontRegistry {
  /** Available when a prepared fontShaper was supplied. Does not rewrite text. */
  shapeText?(text: string, style: TextStyle): ShapedText;
  dispose(): void;
  textMeasurement: TextMeasurement & {outlineBounds: NonNullable<TextMeasurement['outlineBounds']>};
  clearSubstitutions(): void;
  resolveFont(style: TextStyle): FontResolution;
  readonly embeddedFonts: EmbeddedFont[];
  readonly fontPreparations: FontPreparation[];
  readonly substitutions: FontResolution[];
}
export interface FontPreparation {
  family: string; postscriptName: string;
  sourceFormat: string; measurementFormat: string; embeddedFormat: string;
  selectedCollectionFace: boolean;
  /** A DSIG signature was removed from reconstructed measurement/selected-face bytes. */
  removedSignature: boolean;
  embeddingReason?: 'woff2-hmtx-compatibility' | 'dfont-resource';
  /** Original sfnt resource ID and zero-based index in a DFont container. */
  selectedResourceId?: number;
  selectedResourceIndex?: number;
}
export declare class OPFFontError extends Error { code:string; details:Record<string,unknown>; constructor(code:string,message:string,details?:Record<string,unknown>) }
export declare function createFontRegistry(entries: FontFaceInput[], options?: FontRegistryOptions): FontRegistry;
