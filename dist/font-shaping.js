import { createHarfBuzzService } from './font-shaping-service.js';
import { OPFFontError } from './fonts.js';

/** Initialize once before constructing registries; measurement stays synchronous. */
export async function loadHarfBuzzShaper(options = {}) {
  let runtime;
  try { runtime = await import('harfbuzzjs'); }
  catch (error) { throw new OPFFontError('font-shaper-unavailable', 'Could not initialize the local HarfBuzz runtime. Reinstall the pinned package and check WebAssembly support.', {cause:error.message}); }
  return createHarfBuzzService(runtime, options);
}
