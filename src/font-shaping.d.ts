export interface ShapingOptions {
  language?: string;
  script?: string;
  direction?: 'ltr' | 'rtl';
  features?: string[];
}
export interface ShapedGlyph {
  id: number; cluster: number; sourceStart: number; sourceEnd: number;
  xAdvance: number; yAdvance: number; xOffset: number; yOffset: number;
}
/** Glyph positions use font units; width and outline use ems. Source offsets use UTF-16. */
export interface ShapedText {
  engine: string; text: string; unitsPerEm: number; glyphs: ShapedGlyph[]; width: number;
  outline: {x: number; y: number; width: number; height: number} | null;
}
export interface PaintedText extends ShapedText {
  glyphs: (ShapedGlyph & {path: string})[];
  /** Positions and thicknesses in font units; offsets are positive above the baseline. */
  decorations?: Record<'underline'|'strikethrough', {offset:number; thickness:number}>;
  /** Same-run font-unit positions. Interpolated ligature stops are explicitly labeled. */
  caretGeometry?: ShapedCaretGeometry;
}
export interface ShapedCaretGeometry {
  direction: 'ltr' | 'rtl';
  ascent: number;
  descent: number;
  stops: {offset:number; x:number; basis:'cluster'|'font'|'interpolated'}[];
}
export interface FontShaper {
  readonly engine: string;
  readonly cacheKey: string;
  /** Decode local containers synchronously without rewriting caller-owned bytes. */
  prepareFontData?(data: Uint8Array, maxBytes?: number): {data: Uint8Array; removedSignature: boolean; embeddingReason?: 'woff2-hmtx-compatibility'};
  createFace(input: {data: Uint8Array; faceIndex?: number; unitsPerEm: number; variations?: Record<string,number>}): {
    shape(text: string): ShapedText;
    /** Optional vector painter for the same selected face, in font units with y up. Empty means no ink. */
    glyphPath?(glyphId: number): string;
    decorationMetrics?(): NonNullable<PaintedText['decorations']>;
    caretGeometry?(run: ShapedText): ShapedCaretGeometry;
    dispose(): void;
  };
}
/** Opt-in horizontal run shaping with local WOFF/WOFF2 preparation. Paragraph bidi/itemization remains pending. */
export declare function loadHarfBuzzShaper(options?: ShapingOptions): Promise<FontShaper>;
