import { create } from "fontkit";
import { FONT_COMPATIBILITY } from "./font-compatibility.js";
import { OPFFontError } from './font-error.js';
import { fontFormat, extractSfnt, checkFontByteLimit } from './font-sfnt.js';
import { readDfontResources } from './font-dfont.js';
import { prepareFontData } from './font-preparation.js';
import { selectFontVariations } from './font-variations.js';
export { FONT_COMPATIBILITY, EXPERIMENTAL_FONT_CANDIDATES } from "./font-compatibility.js";
export { OPFFontError } from './font-error.js';
const key = (family, weight, italic) => `${family.toLowerCase()}:${weight}:${!!italic}`;
function base64(data) {
  let binary = "";
  for (let i = 0; i < data.length; i += 32768) binary += String.fromCharCode(...data.subarray(i, i + 32768));
  return btoa(binary);
}
function validFamily(family) {
  if (typeof family !== "string" || !family.trim() || /[\u0000-\u001f"'\\<>;]/.test(family)) throw new OPFFontError("invalid-font-family", "Font family must be a nonempty plain name.");
  return family;
}
/** Local font files only. The caller explicitly chooses aliases and fallback. */
export function createFontRegistry(entries, options = {}) {
  if (!Array.isArray(entries) || !entries.length) throw new OPFFontError("empty-font-registry", "Supply at least one font file.");
  const fontShaper = options.fontShaper;
  if (fontShaper && (typeof fontShaper.createFace !== 'function' || typeof fontShaper.cacheKey !== 'string'))
    throw new OPFFontError('invalid-font-shaper', 'Supply an initialized font shaping service.');
  const shapingCacheKey = fontShaper?.cacheKey;
  const maxPreparedFontBytes = checkFontByteLimit(options.maxPreparedFontBytes);
  const faces = entries.map(entry => {
    if (!(entry.data instanceof Uint8Array)) throw new OPFFontError("invalid-font-data", "Font data must be a Uint8Array.");
    const inputFormat = fontFormat(entry.data);
    if ((fontShaper?.prepareFontData || ['collection','woff','woff2'].includes(inputFormat) || !inputFormat) && entry.data.length > maxPreparedFontBytes)
      throw new OPFFontError('font-size-limit','Font source exceeds the configured preparation byte limit.');
    // Buffer.slice() aliases memory; own bytes even when the caller supplies a
    // Node Buffer and later reuses its storage.
    const sourceData = Uint8Array.from(entry.data);
    let sourceFormat = inputFormat ?? 'unknown';
    // Compressed faces need a standalone representation for Fontkit's instance
    // processor as well as HarfBuzz. Keep original wrappers for embedding.
    const prepared = (fontShaper?.prepareFontData ?? (['woff','woff2'].includes(inputFormat) ? prepareFontData : undefined))?.(sourceData, maxPreparedFontBytes);
    let data = prepared?.data ?? sourceData, removedSignature = prepared?.removedSignature ?? false;
    let font, resource;
    if (!fontFormat(data)) {
      const resources = readDfontResources(data, maxPreparedFontBytes);
      sourceFormat = 'dfont';
      if (typeof entry.postscriptName !== 'string' || !entry.postscriptName)
        throw new OPFFontError('font-collection', 'Select one font resource with postscriptName.');
      const matches = resources.filter(candidate => {
        try { return create(candidate.data).postscriptName === entry.postscriptName; }
        catch (error) { throw new OPFFontError('invalid-font-container', error.message); }
      });
      if (matches.length !== 1)
        throw new OPFFontError('font-collection', 'Select a unique PostScript name from the font resources.');
      resource = matches[0];
      const selected = extractSfnt(resource.data, 0, maxPreparedFontBytes);
      data = selected.data; removedSignature ||= selected.removedSignature;
    }
    try { font = create(data, fontFormat(data) === 'collection' ? entry.postscriptName : undefined); } catch (error) { throw new OPFFontError("invalid-font-data", error.message); }
    if (!font?.layout || !font.unitsPerEm) throw new OPFFontError("font-collection", "Select one font from a collection with postscriptName.");
    const collection = fontFormat(data) === 'collection' || !!resource;
    if (fontFormat(data) === 'collection') {
      const faceIndex = create(data).fonts.findIndex(candidate => candidate.postscriptName === font.postscriptName);
      if (faceIndex < 0) throw new OPFFontError('font-collection', 'The selected collection face could not be located.');
      const selected = extractSfnt(data, faceIndex, maxPreparedFontBytes);
      data = selected.data; removedSignature ||= selected.removedSignature;
      font = create(data);
    }
    const instance = selectFontVariations(font, data, {variations:entry.variations,...(!collection?{postscriptName:entry.postscriptName}:{})});
    font = instance.font;
    const family = validFamily(entry.family ?? font.familyName);
    // OpenType groups Medium/SemiBold/ExtraBold under a preferred family, while
    // retaining separate legacy families for four-style native font selectors.
    // An explicit caller rename owns its namespace and must not add this alias.
    const familyGroup = entry.family && entry.family.toLowerCase() !== font.familyName?.toLowerCase()
      ? family : validFamily(font.getName?.('preferredFamily', 'en') ?? family);
    const linking = font['OS/2']?.fsSelection ?? font.head?.macStyle;
    const fontFace = linking && typeof linking.bold === 'boolean' && typeof linking.italic === 'boolean'
      ? {family:validFamily(font.getName?.('fontFamily', 'en') ?? font.familyName ?? family),bold:linking.bold,italic:linking.italic} : undefined;
    const weight = entry.weight ?? 400;
    const italic = entry.italic ?? !!font.italicAngle;
    if (!Number.isInteger(weight) || weight < 1 || weight > 1000) throw new OPFFontError("invalid-font-weight", "Font weight must be between 1 and 1000.");
    // Preserve standalone wrappers. When browser decoding needs a reconstructed
    // face, retain the original separately for SVG metadata. Collections embed
    // the actual selected standalone face.
    const embeddingReason=resource ? 'dfont-resource' : prepared?.embeddingReason;
    const embeddedData = collection || embeddingReason ? data : sourceData;
    const format = fontFormat(embeddedData) ?? 'ttf';
    const preparation = {family,postscriptName:font.postscriptName,sourceFormat,
      measurementFormat:fontFormat(data) ?? 'unknown',embeddedFormat:format,
      selectedCollectionFace:collection,removedSignature,...(embeddingReason?{embeddingReason}:{}),
      ...(resource?{selectedResourceId:resource.id,selectedResourceIndex:resource.index}:{}),
      ...(instance.variations?{variations:instance.variations}:{}),...(instance.namedInstance?{namedInstance:instance.namedInstance}:{})};
    return {family,familyGroup,fontFace,weight,italic,font,data,embeddedData,format,preparation,
      ...(embeddingReason?{sourceData,sourceFormat}:{}),variations:instance.variations,namedInstance:instance.namedInstance,license:entry.license,cache:new Map(),cachedGlyphs:0};
  });
  const duplicates = new Set();
  for (const face of faces) {
    const id = key(face.family,face.weight,face.italic);
    if (duplicates.has(id)) throw new OPFFontError("duplicate-font-face", `Duplicate face: ${id}`);
    duplicates.add(id);
  }
  const familySlots = new Map();
  for (const face of faces) for (const family of new Set([face.family,face.familyGroup])) {
    const id=key(family,face.weight,face.italic),previous=familySlots.get(id);
    if(previous && previous!==face) throw new OPFFontError('ambiguous-font-face', `Multiple physical faces match '${family}' at weight ${face.weight}.`, {fontFamily:family,fontWeight:face.weight,italic:face.italic});
    familySlots.set(id,face);
  }
  const substitutions = new Map();
  const aliases = new Map(Object.entries(options.aliases ?? {}).map(([from,to])=>[validFamily(from).toLowerCase(),validFamily(to)]));
  const policy = options.substitutionPolicy ?? "none";
  if (!["none","metric","visual"].includes(policy)) throw new OPFFontError("invalid-font-policy", "substitutionPolicy must be none, metric, or visual.");
  if (options.fallbackFamily) validFamily(options.fallbackFamily);
  // Construct native resources only after metadata and selection policy validate.
  try {
    if (fontShaper) for (const face of faces)
      face.shaper = fontShaper.createFace({data:face.data, faceIndex:0, unitsPerEm:face.font.unitsPerEm,...(face.variations?{variations:face.variations}:{})});
  } catch (error) {
    for (const face of faces) face.shaper?.dispose();
    throw error;
  }
  let disposed = false;
  const assertActive = () => {
    if (disposed) throw new OPFFontError('font-registry-disposed', 'Create a new font registry after disposal.');
  };
  const findFamily = family => faces.filter(face=>face.family.toLowerCase()===family.toLowerCase() || face.familyGroup.toLowerCase()===family.toLowerCase());
  const resolve = style => {
    assertActive();
    const requested = validFamily(style?.fontFamily);
    const weight = style.fontWeight ?? 400;
    if (!Number.isFinite(weight) || weight < 1 || weight > 1000) throw new OPFFontError("invalid-font-weight", "Font weight must be between 1 and 1000.");
    // DrawingML theme tokens are resolved before family lookup, never as literal fonts.
    const themeKey = {"+mj-lt":"majorLatin","+mn-lt":"minorLatin","+mj-ea":"majorEastAsia","+mn-ea":"minorEastAsia","+mj-cs":"majorComplexScript","+mn-cs":"minorComplexScript"}[requested.toLowerCase()];
    if (requested.startsWith("+") && !themeKey) throw new OPFFontError("unresolved-theme-font", `Unknown theme font '${requested}'.`, {path:style.path});
    const family = themeKey ? options.themeFonts?.[themeKey] : requested;
    if (!family || family.startsWith("+")) throw new OPFFontError("unresolved-theme-font", `Supply a concrete theme family for '${requested}'.`, {path:style.path});
    validFamily(family);
    let matching = findFamily(family), compatibility = "exact", rule;
    const encodedSymbol = /^(wingdings(?: [23])?|webdings|symbol)$/i.test(family);
    if (!matching.length && encodedSymbol) throw new OPFFontError("font-encoding-required", `Font '${family}' requires character mapping before substitution.`, {path:style.path,fontFamily:family});
    if (!matching.length && aliases.has(family.toLowerCase())) {
      matching = findFamily(aliases.get(family.toLowerCase())); compatibility = "visual";
    }
    if (!matching.length && policy!=="none") {
      const candidate = FONT_COMPATIBILITY.find(entry=>entry.requestedFamily.toLowerCase()===family.toLowerCase());
      const tier = candidate?.compatibility==="metric" && !candidate.weights.includes(weight) ? "visual" : candidate?.compatibility;
      if (candidate && (policy==="visual" || tier==="metric")) {
        for (const substitute of candidate.substitutes) {
          const available = findFamily(substitute).filter(face=>face.italic===!!style.italic && (tier!=="metric" || face.weight===weight));
          if (available.length) { matching=available; compatibility=tier; rule=candidate; break; }
        }
      }
    }
    // Equations require an explicit math-aware choice; never fall through to body text.
    if (!matching.length && /^(cambria math|stix two math|noto sans math)$/i.test(family)) throw new OPFFontError("math-font-required", `Supply '${family}' or an explicit math-font alias.`, {path:style.path});
    if (!matching.length && options.fallbackFamily) { matching=findFamily(options.fallbackFamily); compatibility="generic"; }
    if (!matching.length) throw new OPFFontError("font-unavailable", `No local font face for '${family}'.`, {path:style.path,fontFamily:family});
    matching = matching.filter(face=>face.italic===!!style.italic);
    if (!matching.length) throw new OPFFontError("font-style-unavailable", `No ${style.italic ? "italic" : "upright"} face for '${family}'.`, {path:style.path});
    matching.sort((a,b)=>Math.abs(a.weight-weight)-Math.abs(b.weight-weight) || a.weight-b.weight);
    const face = matching[0];
    if (face.weight!==weight && compatibility!=="generic") compatibility="visual";
    const resolution={requestedFamily:requested,sourceFamily:family,resolvedFamily:face.family,requestedWeight:weight,resolvedWeight:face.weight,italic:face.italic,compatibility,...(face.fontFace?{fontFace:{...face.fontFace}}:{}),...(style.path?{path:style.path}:{}),...(rule?{source:rule.source,note:rule.note}:{})};
    if (face.family.toLowerCase()!==family.toLowerCase() || face.weight!==weight) substitutions.set(JSON.stringify([requested,weight,!!style.italic,style.path]),resolution);
    return {face,resolution};
  };
  const resolveFace = style => resolve(style).face;
  const resolveStyle = style => {
    const face=resolveFace(style),resolved={...style,fontFamily:face.family,fontWeight:face.weight,italic:face.italic};
    // Never carry a stale selection from a previously resolved style.
    delete resolved.fontFace;
    if(face.fontFace) resolved.fontFace={...face.fontFace};
    return resolved;
  };
  const metrics = (text,size,style,includeOutline=false) => {
    if (typeof text!=='string'||!Number.isFinite(size)||size<=0) throw new OPFFontError('invalid-text-measurement','Text measurement requires a string and a positive finite font size.');
    const face=resolveFace(style);
    const cacheKey = fontShaper ? JSON.stringify([shapingCacheKey,text]) : text;
    let value=face.cache.get(cacheKey);
    if (value===undefined) {
      if (options.strictGlyphs!==false) for(const character of text) {
        if (/\p{Default_Ignorable_Code_Point}/u.test(character)) continue;
        if (!face.font.hasGlyphForCodePoint(character.codePointAt(0))) throw new OPFFontError("missing-glyph", `Font '${face.family}' cannot display U+${character.codePointAt(0).toString(16).toUpperCase()}.`, {path:style.path,fontFamily:face.family,character});
      }
    }
    if(value===undefined||includeOutline&&!Object.hasOwn(value,'outline')) {
      if (face.shaper) {
        const run = face.shaper.shape(text);
        const validOutline = run?.outline === null || run?.outline &&
          [run.outline.x,run.outline.y,run.outline.width,run.outline.height].every(Number.isFinite) && run.outline.width >= 0 && run.outline.height >= 0;
        if (!Number.isFinite(run?.width) || run.width < 0 || !validOutline)
          throw new OPFFontError('invalid-shaped-metrics', 'The shaping service returned invalid font metrics.');
        value = {width:run.width, outline:run.outline, run};
      } else {
        const run=face.font.layout(text);
        value={width:run.positions.reduce((total,position)=>total+position.xAdvance,0)/face.font.unitsPerEm,...value};
        if(includeOutline) {
          const bounds=run.bbox,unit=face.font.unitsPerEm;
          value.outline=[bounds.minX,bounds.minY,bounds.maxX,bounds.maxY].every(Number.isFinite)
            ?{x:bounds.minX/unit,y:-bounds.maxY/unit,width:bounds.width/unit,height:bounds.height/unit}:null;
        }
      }
      const glyphCount = value.run?.glyphs.length ?? 0;
      if (text.length<=2048 && glyphCount<=8192) {
        face.cachedGlyphs -= face.cache.get(cacheKey)?.run?.glyphs.length ?? 0;
        face.cache.delete(cacheKey);
        while (face.cache.size>=512 || face.cachedGlyphs+glyphCount>8192) {
          const oldest = face.cache.keys().next().value;
          face.cachedGlyphs -= face.cache.get(oldest)?.run?.glyphs.length ?? 0;
          face.cache.delete(oldest);
        }
        face.cache.set(cacheKey,value);
        face.cachedGlyphs += glyphCount;
      }
    }
    return value;
  };
  const measure=(text,size,style)=>metrics(text,size,style).width*size;
  const outlineBounds=(text,size,style)=>{
    const bounds=metrics(text,size,style,true).outline;
    return bounds===null?null:{x:bounds.x*size,y:bounds.y*size,width:bounds.width*size,height:bounds.height*size};
  };
  const textMeasurement = {measure,resolveStyle,outlineBounds};
  const textPainting = fontShaper && faces.every(face => typeof face.shaper.glyphPath === 'function')
    ? Object.freeze({textMeasurement, shape(text, style) {
      const run = structuredClone(metrics(text,1,style,true).run), face = resolveFace(style);
      // Color and bitmap glyph painting requires its own paint-graph contract.
      // Do not silently replace color glyphs with a monochrome base outline.
      if (['COLR','CBDT','sbix','SVG '].some(tag => face.font.directory.tables[tag]))
        throw new OPFFontError('unsupported-font-painting', 'Shaped vector painting of color or bitmap fonts is not implemented.', {path:style.path,fontFamily:face.family});
      if (run.text !== text || run.unitsPerEm !== face.font.unitsPerEm || !Array.isArray(run.glyphs))
        throw new OPFFontError('invalid-shaped-paint', 'The painter must use the measured source text and selected font.');
      const paths = new Map();
      for (const glyph of run.glyphs) {
        if (![glyph.id,glyph.cluster,glyph.sourceStart,glyph.sourceEnd].every(Number.isInteger) ||
            glyph.id < 0 || glyph.sourceStart !== glyph.cluster || glyph.sourceStart < 0 ||
            glyph.sourceEnd < glyph.sourceStart || glyph.sourceEnd > text.length ||
            ![glyph.xAdvance,glyph.yAdvance,glyph.xOffset,glyph.yOffset].every(Number.isFinite))
          throw new OPFFontError('invalid-shaped-paint', 'The painter requires valid glyph positions and original UTF-16 source ranges.');
        if (!paths.has(glyph.id)) {
          const value = face.shaper.glyphPath(glyph.id);
          if (typeof value !== 'string' || /[^MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]/.test(value) ||
              !(value.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).every(number => Number.isFinite(Number(number))))
            throw new OPFFontError('invalid-shaped-paint', 'The selected glyph has no valid finite SVG outline.');
          paths.set(glyph.id, value);
        }
        glyph.path = paths.get(glyph.id);
      }
      if (run.glyphs.reduce((sum,glyph) => sum + glyph.xAdvance,0) / run.unitsPerEm !== run.width)
        throw new OPFFontError('invalid-shaped-paint', 'Painted glyph advances must equal the measured run width.');
      if (face.shaper.decorationMetrics) run.decorations = face.shaper.decorationMetrics();
      return run;
    }}) : undefined;
  return {
    textMeasurement,
    ...(textPainting ? {textPainting} : {}),
    ...(fontShaper ? {shapeText(text,style) { return structuredClone(metrics(text,1,style,true).run); }} : {}),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const face of faces) { face.cache.clear(); face.cachedGlyphs=0; face.shaper?.dispose(); }
      substitutions.clear();
    },
    resolveFont(style) { return resolve(style).resolution; },
    clearSubstitutions() { substitutions.clear(); },
    get substitutions() { return [...substitutions.values()]; },
    get embeddedFonts() { return faces.map(face=>({family:face.family,weight:face.weight,italic:face.italic,...(face.license ? {license:face.license} : {}),...(face.variations?{variations:{...face.variations}}:{}),...(face.namedInstance?{namedInstance:face.namedInstance}:{}),dataUrl:`data:font/${face.format};base64,${base64(face.embeddedData)}`,...(face.sourceData?{sourceDataUrl:`data:font/${face.sourceFormat};base64,${base64(face.sourceData)}`}:{})})); },
    get fontPreparations() { return faces.map(face=>({...face.preparation,...(face.variations?{variations:{...face.variations}}:{})})); },
  };
}
