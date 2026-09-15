import { OPFFontError } from './fonts.js';
import { prepareFontData } from './font-preparation.js';

function configuration(hb, options) {
  const {language = 'und', script, direction, features = []} = options;
  if (typeof language !== 'string' || !/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(language))
    throw new OPFFontError('invalid-shaping-language', 'Supply a language tag such as en or und.');
  if (script !== undefined && (typeof script !== 'string' || !/^[A-Za-z]{4}$/.test(script)))
    throw new OPFFontError('invalid-shaping-script', 'Supply a four-letter Unicode script tag.');
  if (direction !== undefined && !['ltr', 'rtl'].includes(direction))
    throw new OPFFontError('invalid-shaping-direction', 'Horizontal text direction must be ltr or rtl.');
  if (!Array.isArray(features)) throw new OPFFontError('invalid-shaping-feature', 'Supply an array of OpenType feature strings.');
  const parsed = features.map(value => {
    if (typeof value !== 'string' || /[^\x20-\x7e]/.test(value)) throw new OPFFontError('invalid-shaping-feature', 'OpenType features must be plain ASCII strings.');
    const feature = hb.Feature.fromString(value);
    if (!feature) throw new OPFFontError('invalid-shaping-feature', `Invalid OpenType feature: ${value}`);
    return feature;
  });
  return {language, script, direction, features: parsed, key: JSON.stringify([language, script, direction, features])};
}

/** Internal factory shared by the Node and browser public entrypoints. */
export function createHarfBuzzService(hb, options) {
  const settings = configuration(hb, options);
  const engine = `harfbuzz:${hb.versionString()}`;
  return Object.freeze({
    engine,
    cacheKey: `${engine}:${settings.key}`,
    prepareFontData,
    createFace({data, faceIndex = 0, unitsPerEm}) {
      if (!(data instanceof Uint8Array) || data.byteLength < 12 || !Number.isInteger(unitsPerEm) || unitsPerEm <= 0 || !Number.isInteger(faceIndex) || faceIndex < 0)
        throw new OPFFontError('invalid-shaping-font', 'Supply parsed font bytes, a valid selected face index, and units per em.');
      const signature = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0);
      // Do not silently fall back to the old shaper for an unsupported input.
      // The registry prepares compressed fonts before creating a shaping face.
      if (![0x00010000, 0x4f54544f, 0x74727565, 0x74746366].includes(signature))
        throw new OPFFontError('shaping-font-format', 'Prepare font containers before creating a HarfBuzz face.');
      let blob = new hb.Blob(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      let face = new hb.Face(blob, faceIndex);
      if (face.upem !== unitsPerEm)
        throw new OPFFontError('shaping-font-mismatch', 'The shaping engine did not load the selected physical font face.');
      let font = new hb.Font(face), buffer = new hb.Buffer();
      font.setScale(unitsPerEm, unitsPerEm);
      return {
        shape(text) {
          if (!font) throw new OPFFontError('font-registry-disposed', 'Create a new font registry after disposal.');
          if (typeof text !== 'string' || !text.isWellFormed())
            throw new OPFFontError('invalid-shaping-text', 'Shape a well-formed UTF-16 string without rewriting its source.');
          buffer.reset();
          buffer.addText(text); // hb_buffer_add_utf16: clusters are original JS offsets.
          buffer.setLanguage(settings.language);
          if (settings.script) buffer.setScript(settings.script);
          if (settings.direction) buffer.setDirection(settings.direction === 'rtl' ? hb.Direction.RTL : hb.Direction.LTR);
          buffer.guessSegmentProperties();
          hb.shape(font, buffer, settings.features);
          const positions = buffer.getGlyphPositions();
          const infos = buffer.getGlyphInfos();
          const starts = [...new Set(infos.map(info => info.cluster))].sort((a, b) => a - b);
          const ends = new Map(starts.map((start, index) => [start, starts[index + 1] ?? text.length]));
          let x = 0, y = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          const glyphs = infos.map((info, index) => {
            const position = positions[index];
            const bounds = font.glyphExtents(info.codepoint);
            if (bounds && bounds.width !== 0 && bounds.height !== 0) {
              const left = x + position.xOffset + bounds.xBearing;
              const top = y + position.yOffset + bounds.yBearing;
              minX = Math.min(minX, left, left + bounds.width);
              maxX = Math.max(maxX, left, left + bounds.width);
              minY = Math.min(minY, top, top + bounds.height);
              maxY = Math.max(maxY, top, top + bounds.height);
            }
            x += position.xAdvance;
            y += position.yAdvance;
            return {id: info.codepoint, cluster: info.cluster, sourceStart: info.cluster, sourceEnd: ends.get(info.cluster), ...position};
          });
          return {
            engine, text, unitsPerEm, glyphs, width: x / unitsPerEm,
            outline: Number.isFinite(minX)
              ? {x: minX / unitsPerEm, y: -maxY / unitsPerEm, width: (maxX - minX) / unitsPerEm, height: (maxY - minY) / unitsPerEm}
              : null,
          };
        },
        dispose() {
          // harfbuzzjs owns native destruction through FinalizationRegistry.
          // Drop our references deterministically; do not claim synchronous WASM free.
          buffer = font = face = blob = null;
        },
      };
    },
  });
}
