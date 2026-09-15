import {OPFFontError} from './font-error.js';
import {fontFormat, checkFontByteLimit, extractSfnt} from './font-sfnt.js';
import {decodeWoff} from './font-woff.js';
import {woff2Decode} from './font-woff2.js';

/** Synchronous after service initialization; does not modify the input bytes. */
export function prepareFontData(data, maxBytes) {
  maxBytes = checkFontByteLimit(maxBytes);
  if (!(data instanceof Uint8Array)) throw new OPFFontError('invalid-font-data','Font data must be a Uint8Array.');
  if (data.length > maxBytes) throw new OPFFontError('font-size-limit','Font source exceeds the configured byte limit.');
  try {
    const format = fontFormat(data);
    if (format === 'woff') return decodeWoff(data, maxBytes);
    if (format === 'woff2') {
      const decoded = woff2Decode(data, maxBytes);
      // A collection needs the caller's explicit face selection before repacking.
      return fontFormat(decoded) === 'collection' ? {data:decoded,removedSignature:false} : extractSfnt(decoded, 0, maxBytes);
    }
    return {data,removedSignature:false};
  } catch (error) {
    if (error instanceof OPFFontError) throw error;
    throw new OPFFontError(error.code === 'font-size-limit' ? error.code : 'invalid-font-container',error.message);
  }
}
