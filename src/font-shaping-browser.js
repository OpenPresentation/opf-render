import { createHarfBuzzService } from './font-shaping-service.js';
import { OPFFontError } from './fonts.js';

/** The package build supplies a browser runtime and its adjacent, local WASM. */
export async function loadHarfBuzzShaper(options = {}) {
  let runtime;
  try { runtime = await import('./harfbuzz-browser.js'); }
  catch (error) { throw new OPFFontError('font-shaper-unavailable', 'Could not initialize HarfBuzz. Serve the packaged WASM beside the browser module and allow WebAssembly in the host CSP.', {cause:error.message}); }
  return createHarfBuzzService(runtime, options);
}
