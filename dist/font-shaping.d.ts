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
export interface FontShaper {
  readonly engine: string;
  readonly cacheKey: string;
  /** Decode local containers synchronously without rewriting caller-owned bytes. */
  prepareFontData?(data: Uint8Array, maxBytes?: number): {data: Uint8Array; removedSignature: boolean};
  createFace(input: {data: Uint8Array; faceIndex?: number; unitsPerEm: number}): {
    shape(text: string): ShapedText;
    dispose(): void;
  };
}
/** Opt-in horizontal run shaping with local WOFF/WOFF2 preparation. Paragraph bidi/itemization remains pending. */
export declare function loadHarfBuzzShaper(options?: ShapingOptions): Promise<FontShaper>;
