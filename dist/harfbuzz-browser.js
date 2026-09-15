// node_modules/harfbuzzjs/dist/harfbuzz.js
async function createHarfBuzz(moduleArg = {}) {
  var moduleRtn, Module2 = moduleArg, ENVIRONMENT_IS_WEB = typeof window == "object", ENVIRONMENT_IS_WORKER = typeof WorkerGlobalScope < "u";
  if (0)
    var require2;
  var arguments_ = [], thisProgram = "./this.program", quit_ = (status, toThrow) => {
    throw toThrow;
  }, _scriptName = import.meta.url, scriptDirectory = "";
  function locateFile(path) {
    return Module2.locateFile ? Module2.locateFile(path, scriptDirectory) : scriptDirectory + path;
  }
  var readAsync, readBinary;
  if (0)
    var fs;
  else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    try {
      scriptDirectory = new URL(".", _scriptName).href;
    } catch {
    }
    ENVIRONMENT_IS_WORKER && (readBinary = (url) => {
      var xhr = new XMLHttpRequest();
      return xhr.open("GET", url, !1), xhr.responseType = "arraybuffer", xhr.send(null), new Uint8Array(xhr.response);
    }), readAsync = async (url) => {
      if (isFileURI(url))
        return new Promise((resolve, reject) => {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, !0), xhr.responseType = "arraybuffer", xhr.onload = () => {
            if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
              resolve(xhr.response);
              return;
            }
            reject(xhr.status);
          }, xhr.onerror = reject, xhr.send(null);
        });
      var response = await fetch(url, { credentials: "same-origin" });
      if (response.ok)
        return response.arrayBuffer();
      throw new Error(response.status + " : " + response.url);
    };
  }
  var out = console.log.bind(console), err = console.error.bind(console), wasmBinary, ABORT = !1, EXITSTATUS, isFileURI = (filename) => filename.startsWith("file://"), readyPromiseResolve, readyPromiseReject, wasmMemory, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64, HEAP64, HEAPU64, runtimeInitialized = !1;
  function updateMemoryViews() {
    var b = wasmMemory.buffer;
    Module2.HEAP8 = HEAP8 = new Int8Array(b), HEAP16 = new Int16Array(b), Module2.HEAPU8 = HEAPU8 = new Uint8Array(b), Module2.HEAPU16 = HEAPU16 = new Uint16Array(b), Module2.HEAP32 = HEAP32 = new Int32Array(b), Module2.HEAPU32 = HEAPU32 = new Uint32Array(b), Module2.HEAPF32 = HEAPF32 = new Float32Array(b), HEAPF64 = new Float64Array(b), HEAP64 = new BigInt64Array(b), HEAPU64 = new BigUint64Array(b);
  }
  function preRun() {
    if (Module2.preRun)
      for (typeof Module2.preRun == "function" && (Module2.preRun = [Module2.preRun]); Module2.preRun.length; )
        addOnPreRun(Module2.preRun.shift());
    callRuntimeCallbacks(onPreRuns);
  }
  function initRuntime() {
    runtimeInitialized = !0, wasmExports.__wasm_call_ctors();
  }
  function postRun() {
    if (Module2.postRun)
      for (typeof Module2.postRun == "function" && (Module2.postRun = [Module2.postRun]); Module2.postRun.length; )
        addOnPostRun(Module2.postRun.shift());
    callRuntimeCallbacks(onPostRuns);
  }
  var runDependencies = 0, dependenciesFulfilled = null;
  function addRunDependency(id) {
    runDependencies++, Module2.monitorRunDependencies?.(runDependencies);
  }
  function removeRunDependency(id) {
    if (runDependencies--, Module2.monitorRunDependencies?.(runDependencies), runDependencies == 0 && dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null, callback();
    }
  }
  function abort(what) {
    Module2.onAbort?.(what), what = "Aborted(" + what + ")", err(what), ABORT = !0, what += ". Build with -sASSERTIONS for more info.";
    var e = new WebAssembly.RuntimeError(what);
    throw readyPromiseReject?.(e), e;
  }
  var wasmBinaryFile;
  function findWasmBinary() {
    return Module2.locateFile ? locateFile("harfbuzz.wasm") : new URL("harfbuzz.wasm", import.meta.url).href;
  }
  function getBinarySync(file) {
    if (file == wasmBinaryFile && wasmBinary)
      return new Uint8Array(wasmBinary);
    if (readBinary)
      return readBinary(file);
    throw "both async and sync fetching of the wasm failed";
  }
  async function getWasmBinary(binaryFile) {
    if (!wasmBinary)
      try {
        var response = await readAsync(binaryFile);
        return new Uint8Array(response);
      } catch {
      }
    return getBinarySync(binaryFile);
  }
  async function instantiateArrayBuffer(binaryFile, imports) {
    try {
      var binary = await getWasmBinary(binaryFile), instance = await WebAssembly.instantiate(binary, imports);
      return instance;
    } catch (reason) {
      err(`failed to asynchronously prepare wasm: ${reason}`), abort(reason);
    }
  }
  async function instantiateAsync(binary, binaryFile, imports) {
    if (!binary && !isFileURI(binaryFile))
      try {
        var response = fetch(binaryFile, { credentials: "same-origin" }), instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
        return instantiationResult;
      } catch (reason) {
        err(`wasm streaming compile failed: ${reason}`), err("falling back to ArrayBuffer instantiation");
      }
    return instantiateArrayBuffer(binaryFile, imports);
  }
  function getWasmImports() {
    return { env: wasmImports, wasi_snapshot_preview1: wasmImports };
  }
  async function createWasm() {
    function receiveInstance(instance, module) {
      return wasmExports = instance.exports, Module2.wasmExports = wasmExports, wasmMemory = wasmExports.memory, updateMemoryViews(), wasmTable = wasmExports.__indirect_function_table, assignWasmExports(wasmExports), removeRunDependency("wasm-instantiate"), wasmExports;
    }
    addRunDependency("wasm-instantiate");
    function receiveInstantiationResult(result2) {
      return receiveInstance(result2.instance);
    }
    var info = getWasmImports();
    if (Module2.instantiateWasm)
      return new Promise((resolve, reject) => {
        Module2.instantiateWasm(info, (mod, inst) => {
          resolve(receiveInstance(mod, inst));
        });
      });
    wasmBinaryFile ??= findWasmBinary();
    var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info), exports2 = receiveInstantiationResult(result);
    return exports2;
  }
  class ExitStatus {
    name = "ExitStatus";
    constructor(status) {
      this.message = `Program terminated with exit(${status})`, this.status = status;
    }
  }
  var callRuntimeCallbacks = (callbacks) => {
    for (; callbacks.length > 0; )
      callbacks.shift()(Module2);
  }, onPostRuns = [], addOnPostRun = (cb) => onPostRuns.push(cb), onPreRuns = [], addOnPreRun = (cb) => onPreRuns.push(cb), noExitRuntime = !0, stackRestore = (val) => __emscripten_stack_restore(val), stackSave = () => _emscripten_stack_get_current(), __abort_js = () => abort(""), runtimeKeepaliveCounter = 0, __emscripten_runtime_keepalive_clear = () => {
    noExitRuntime = !1, runtimeKeepaliveCounter = 0;
  }, timers = {}, handleException = (e) => {
    if (e instanceof ExitStatus || e == "unwind")
      return EXITSTATUS;
    quit_(1, e);
  }, keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0, _proc_exit = (code) => {
    EXITSTATUS = code, keepRuntimeAlive() || (Module2.onExit?.(code), ABORT = !0), quit_(code, new ExitStatus(code));
  }, exitJS = (status, implicit) => {
    EXITSTATUS = status, _proc_exit(status);
  }, _exit = exitJS, maybeExit = () => {
    if (!keepRuntimeAlive())
      try {
        _exit(EXITSTATUS);
      } catch (e) {
        handleException(e);
      }
  }, callUserCallback = (func) => {
    if (!ABORT)
      try {
        func(), maybeExit();
      } catch (e) {
        handleException(e);
      }
  }, _emscripten_get_now = () => performance.now(), __setitimer_js = (which, timeout_ms) => {
    if (timers[which] && (clearTimeout(timers[which].id), delete timers[which]), !timeout_ms) return 0;
    var id = setTimeout(() => {
      delete timers[which], callUserCallback(() => __emscripten_timeout(which, _emscripten_get_now()));
    }, timeout_ms);
    return timers[which] = { id, timeout_ms }, 0;
  }, getHeapMax = () => 2147483648, alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment, growMemory = (size) => {
    var oldHeapSize = wasmMemory.buffer.byteLength, pages = (size - oldHeapSize + 65535) / 65536 | 0;
    try {
      return wasmMemory.grow(pages), updateMemoryViews(), 1;
    } catch {
    }
  }, _emscripten_resize_heap = (requestedSize) => {
    var oldSize = HEAPU8.length;
    requestedSize >>>= 0;
    var maxHeapSize = getHeapMax();
    if (requestedSize > maxHeapSize)
      return !1;
    for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
      var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
      overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
      var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536)), replacement = growMemory(newSize);
      if (replacement)
        return !0;
    }
    return !1;
  }, uleb128EncodeWithLen = (arr) => {
    let n = arr.length;
    return [n % 128 | 128, n >> 7, ...arr];
  }, wasmTypeCodes = { i: 127, p: 127, j: 126, f: 125, d: 124, e: 111 }, generateTypePack = (types) => uleb128EncodeWithLen(Array.from(types, (type) => {
    var code = wasmTypeCodes[type];
    return code;
  })), convertJsFunctionToWasm = (func, sig) => {
    var bytes = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0, 1, ...uleb128EncodeWithLen([1, 96, ...generateTypePack(sig.slice(1)), ...generateTypePack(sig[0] === "v" ? "" : sig[0])]), 2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0), module = new WebAssembly.Module(bytes), instance = new WebAssembly.Instance(module, { e: { f: func } }), wrappedFunc = instance.exports.f;
    return wrappedFunc;
  }, wasmTable, getWasmTableEntry = (funcPtr) => wasmTable.get(funcPtr), updateTableMap = (offset, count) => {
    if (functionsInTableMap)
      for (var i = offset; i < offset + count; i++) {
        var item = getWasmTableEntry(i);
        item && functionsInTableMap.set(item, i);
      }
  }, functionsInTableMap, getFunctionAddress = (func) => (functionsInTableMap || (functionsInTableMap = /* @__PURE__ */ new WeakMap(), updateTableMap(0, wasmTable.length)), functionsInTableMap.get(func) || 0), freeTableIndexes = [], getEmptyTableSlot = () => freeTableIndexes.length ? freeTableIndexes.pop() : wasmTable.grow(1), setWasmTableEntry = (idx, func) => wasmTable.set(idx, func), addFunction = (func, sig) => {
    var rtn = getFunctionAddress(func);
    if (rtn)
      return rtn;
    var ret = getEmptyTableSlot();
    try {
      setWasmTableEntry(ret, func);
    } catch (err2) {
      if (!(err2 instanceof TypeError))
        throw err2;
      var wrapped = convertJsFunctionToWasm(func, sig);
      setWasmTableEntry(ret, wrapped);
    }
    return functionsInTableMap.set(func, ret), ret;
  }, removeFunction = (index) => {
    functionsInTableMap.delete(getWasmTableEntry(index)), setWasmTableEntry(index, null), freeTableIndexes.push(index);
  }, stackAlloc = (sz) => __emscripten_stack_alloc(sz);
  Module2.noExitRuntime && (noExitRuntime = Module2.noExitRuntime), Module2.print && (out = Module2.print), Module2.printErr && (err = Module2.printErr), Module2.wasmBinary && (wasmBinary = Module2.wasmBinary), Module2.arguments && (arguments_ = Module2.arguments), Module2.thisProgram && (thisProgram = Module2.thisProgram), Module2.wasmExports = wasmExports, Module2.stackSave = stackSave, Module2.stackRestore = stackRestore, Module2.stackAlloc = stackAlloc, Module2.addFunction = addFunction, Module2.removeFunction = removeFunction;
  var _hb_blob_create, _hb_blob_destroy, _hb_blob_get_length, _hb_blob_get_data, _hb_buffer_serialize, _hb_buffer_create, _hb_buffer_reset, _hb_buffer_reference, _hb_buffer_destroy, _hb_buffer_get_content_type, _hb_buffer_set_direction, _hb_buffer_set_script, _hb_buffer_set_language, _hb_buffer_set_flags, _hb_buffer_set_cluster_level, _hb_buffer_clear_contents, _hb_buffer_add, _hb_buffer_get_length, _hb_buffer_get_glyph_infos, _hb_buffer_get_glyph_positions, _hb_glyph_info_get_glyph_flags, _hb_buffer_guess_segment_properties, _hb_buffer_add_utf8, _hb_buffer_add_utf16, _hb_buffer_add_codepoints, _hb_buffer_set_message_func, _hb_language_from_string, _hb_language_to_string, _hb_script_from_string, _hb_version, _hb_version_string, _hb_feature_from_string, _hb_feature_to_string, _hb_variation_from_string, _hb_variation_to_string, _malloc, _free, _hb_draw_funcs_set_move_to_func, _hb_draw_funcs_set_line_to_func, _hb_draw_funcs_set_quadratic_to_func, _hb_draw_funcs_set_cubic_to_func, _hb_draw_funcs_set_close_path_func, _hb_draw_funcs_create, _hb_draw_funcs_destroy, _hb_face_create, _hb_face_reference, _hb_face_destroy, _hb_face_reference_table, _hb_face_get_upem, _hb_face_collect_unicodes, _hb_font_funcs_create, _hb_font_funcs_destroy, _hb_font_funcs_set_font_h_extents_func, _hb_font_funcs_set_font_v_extents_func, _hb_font_funcs_set_nominal_glyph_func, _hb_font_funcs_set_nominal_glyphs_func, _hb_font_funcs_set_variation_glyph_func, _hb_font_funcs_set_glyph_h_advance_func, _hb_font_funcs_set_glyph_v_advance_func, _hb_font_funcs_set_glyph_h_advances_func, _hb_font_funcs_set_glyph_v_advances_func, _hb_font_funcs_set_glyph_h_origin_func, _hb_font_funcs_set_glyph_v_origin_func, _hb_font_funcs_set_glyph_h_kerning_func, _hb_font_funcs_set_glyph_extents_func, _hb_font_funcs_set_glyph_name_func, _hb_font_funcs_set_glyph_from_name_func, _hb_font_get_h_extents, _hb_font_get_v_extents, _hb_font_get_glyph, _hb_font_get_nominal_glyph, _hb_font_get_variation_glyph, _hb_font_get_glyph_h_advance, _hb_font_get_glyph_v_advance, _hb_font_get_glyph_h_origin, _hb_font_get_glyph_v_origin, _hb_font_get_glyph_extents, _hb_font_get_glyph_from_name, _hb_font_draw_glyph_or_fail, _hb_font_paint_glyph_or_fail, _hb_font_draw_glyph, _hb_font_paint_glyph, _hb_font_glyph_to_string, _hb_font_create, _hb_font_set_variations, _hb_font_create_sub_font, _hb_font_reference, _hb_font_destroy, _hb_font_get_face, _hb_font_set_funcs, _hb_font_set_scale, _hb_ot_color_has_palettes, _hb_ot_color_palette_get_count, _hb_ot_color_palette_get_name_id, _hb_ot_color_palette_color_get_name_id, _hb_ot_color_palette_get_flags, _hb_ot_color_palette_get_colors, _hb_ot_color_has_layers, _hb_ot_color_has_paint, _hb_ot_color_glyph_has_paint, _hb_ot_color_glyph_get_layers, _hb_ot_color_has_png, _hb_ot_color_glyph_reference_png, _hb_ot_layout_get_glyph_class, _hb_ot_layout_get_ligature_carets, _hb_ot_layout_table_get_script_tags, _hb_ot_layout_table_get_feature_tags, _hb_ot_layout_script_get_language_tags, _hb_ot_layout_language_get_feature_tags, _hb_ot_layout_feature_get_lookups, _hb_ot_layout_feature_get_name_ids, _hb_ot_metrics_get_position_with_fallback, _hb_ot_layout_lookup_get_optical_bound, _hb_ot_metrics_get_position, _hb_ot_metrics_get_variation, _hb_ot_metrics_get_x_variation, _hb_ot_metrics_get_y_variation, _hb_ot_name_list_names, _hb_ot_name_get_utf16, _hb_set_create, _hb_set_destroy, _hb_ot_tag_to_script, _hb_ot_tag_to_language, _hb_ot_var_get_axis_infos, _hb_paint_funcs_set_push_transform_func, _hb_paint_funcs_set_pop_transform_func, _hb_paint_funcs_set_color_glyph_func, _hb_paint_funcs_set_push_clip_glyph_func, _hb_paint_funcs_set_push_clip_rectangle_func, _hb_paint_funcs_set_pop_clip_func, _hb_paint_funcs_set_color_func, _hb_paint_funcs_set_image_func, _hb_paint_funcs_set_linear_gradient_func, _hb_paint_funcs_set_radial_gradient_func, _hb_paint_funcs_set_sweep_gradient_func, _hb_paint_funcs_set_push_group_func, _hb_paint_funcs_set_pop_group_func, _hb_paint_funcs_set_custom_palette_color_func, _hb_paint_funcs_create, _hb_paint_funcs_destroy, _hb_color_line_get_color_stops, _hb_color_line_get_extend, _hb_set_get_population, _hb_set_next_many, _hb_shape, __emscripten_timeout, __emscripten_stack_restore, __emscripten_stack_alloc, _emscripten_stack_get_current;
  function assignWasmExports(wasmExports2) {
    Module2._hb_blob_create = _hb_blob_create = wasmExports2.hb_blob_create, Module2._hb_blob_destroy = _hb_blob_destroy = wasmExports2.hb_blob_destroy, Module2._hb_blob_get_length = _hb_blob_get_length = wasmExports2.hb_blob_get_length, Module2._hb_blob_get_data = _hb_blob_get_data = wasmExports2.hb_blob_get_data, Module2._hb_buffer_serialize = _hb_buffer_serialize = wasmExports2.hb_buffer_serialize, Module2._hb_buffer_create = _hb_buffer_create = wasmExports2.hb_buffer_create, Module2._hb_buffer_reset = _hb_buffer_reset = wasmExports2.hb_buffer_reset, Module2._hb_buffer_reference = _hb_buffer_reference = wasmExports2.hb_buffer_reference, Module2._hb_buffer_destroy = _hb_buffer_destroy = wasmExports2.hb_buffer_destroy, Module2._hb_buffer_get_content_type = _hb_buffer_get_content_type = wasmExports2.hb_buffer_get_content_type, Module2._hb_buffer_set_direction = _hb_buffer_set_direction = wasmExports2.hb_buffer_set_direction, Module2._hb_buffer_set_script = _hb_buffer_set_script = wasmExports2.hb_buffer_set_script, Module2._hb_buffer_set_language = _hb_buffer_set_language = wasmExports2.hb_buffer_set_language, Module2._hb_buffer_set_flags = _hb_buffer_set_flags = wasmExports2.hb_buffer_set_flags, Module2._hb_buffer_set_cluster_level = _hb_buffer_set_cluster_level = wasmExports2.hb_buffer_set_cluster_level, Module2._hb_buffer_clear_contents = _hb_buffer_clear_contents = wasmExports2.hb_buffer_clear_contents, Module2._hb_buffer_add = _hb_buffer_add = wasmExports2.hb_buffer_add, Module2._hb_buffer_get_length = _hb_buffer_get_length = wasmExports2.hb_buffer_get_length, Module2._hb_buffer_get_glyph_infos = _hb_buffer_get_glyph_infos = wasmExports2.hb_buffer_get_glyph_infos, Module2._hb_buffer_get_glyph_positions = _hb_buffer_get_glyph_positions = wasmExports2.hb_buffer_get_glyph_positions, Module2._hb_glyph_info_get_glyph_flags = _hb_glyph_info_get_glyph_flags = wasmExports2.hb_glyph_info_get_glyph_flags, Module2._hb_buffer_guess_segment_properties = _hb_buffer_guess_segment_properties = wasmExports2.hb_buffer_guess_segment_properties, Module2._hb_buffer_add_utf8 = _hb_buffer_add_utf8 = wasmExports2.hb_buffer_add_utf8, Module2._hb_buffer_add_utf16 = _hb_buffer_add_utf16 = wasmExports2.hb_buffer_add_utf16, Module2._hb_buffer_add_codepoints = _hb_buffer_add_codepoints = wasmExports2.hb_buffer_add_codepoints, Module2._hb_buffer_set_message_func = _hb_buffer_set_message_func = wasmExports2.hb_buffer_set_message_func, Module2._hb_language_from_string = _hb_language_from_string = wasmExports2.hb_language_from_string, Module2._hb_language_to_string = _hb_language_to_string = wasmExports2.hb_language_to_string, Module2._hb_script_from_string = _hb_script_from_string = wasmExports2.hb_script_from_string, Module2._hb_version = _hb_version = wasmExports2.hb_version, Module2._hb_version_string = _hb_version_string = wasmExports2.hb_version_string, Module2._hb_feature_from_string = _hb_feature_from_string = wasmExports2.hb_feature_from_string, Module2._hb_feature_to_string = _hb_feature_to_string = wasmExports2.hb_feature_to_string, Module2._hb_variation_from_string = _hb_variation_from_string = wasmExports2.hb_variation_from_string, Module2._hb_variation_to_string = _hb_variation_to_string = wasmExports2.hb_variation_to_string, Module2._malloc = _malloc = wasmExports2.malloc, Module2._free = _free = wasmExports2.free, Module2._hb_draw_funcs_set_move_to_func = _hb_draw_funcs_set_move_to_func = wasmExports2.hb_draw_funcs_set_move_to_func, Module2._hb_draw_funcs_set_line_to_func = _hb_draw_funcs_set_line_to_func = wasmExports2.hb_draw_funcs_set_line_to_func, Module2._hb_draw_funcs_set_quadratic_to_func = _hb_draw_funcs_set_quadratic_to_func = wasmExports2.hb_draw_funcs_set_quadratic_to_func, Module2._hb_draw_funcs_set_cubic_to_func = _hb_draw_funcs_set_cubic_to_func = wasmExports2.hb_draw_funcs_set_cubic_to_func, Module2._hb_draw_funcs_set_close_path_func = _hb_draw_funcs_set_close_path_func = wasmExports2.hb_draw_funcs_set_close_path_func, Module2._hb_draw_funcs_create = _hb_draw_funcs_create = wasmExports2.hb_draw_funcs_create, Module2._hb_draw_funcs_destroy = _hb_draw_funcs_destroy = wasmExports2.hb_draw_funcs_destroy, Module2._hb_face_create = _hb_face_create = wasmExports2.hb_face_create, Module2._hb_face_reference = _hb_face_reference = wasmExports2.hb_face_reference, Module2._hb_face_destroy = _hb_face_destroy = wasmExports2.hb_face_destroy, Module2._hb_face_reference_table = _hb_face_reference_table = wasmExports2.hb_face_reference_table, Module2._hb_face_get_upem = _hb_face_get_upem = wasmExports2.hb_face_get_upem, Module2._hb_face_collect_unicodes = _hb_face_collect_unicodes = wasmExports2.hb_face_collect_unicodes, Module2._hb_font_funcs_create = _hb_font_funcs_create = wasmExports2.hb_font_funcs_create, Module2._hb_font_funcs_destroy = _hb_font_funcs_destroy = wasmExports2.hb_font_funcs_destroy, Module2._hb_font_funcs_set_font_h_extents_func = _hb_font_funcs_set_font_h_extents_func = wasmExports2.hb_font_funcs_set_font_h_extents_func, Module2._hb_font_funcs_set_font_v_extents_func = _hb_font_funcs_set_font_v_extents_func = wasmExports2.hb_font_funcs_set_font_v_extents_func, Module2._hb_font_funcs_set_nominal_glyph_func = _hb_font_funcs_set_nominal_glyph_func = wasmExports2.hb_font_funcs_set_nominal_glyph_func, Module2._hb_font_funcs_set_nominal_glyphs_func = _hb_font_funcs_set_nominal_glyphs_func = wasmExports2.hb_font_funcs_set_nominal_glyphs_func, Module2._hb_font_funcs_set_variation_glyph_func = _hb_font_funcs_set_variation_glyph_func = wasmExports2.hb_font_funcs_set_variation_glyph_func, Module2._hb_font_funcs_set_glyph_h_advance_func = _hb_font_funcs_set_glyph_h_advance_func = wasmExports2.hb_font_funcs_set_glyph_h_advance_func, Module2._hb_font_funcs_set_glyph_v_advance_func = _hb_font_funcs_set_glyph_v_advance_func = wasmExports2.hb_font_funcs_set_glyph_v_advance_func, Module2._hb_font_funcs_set_glyph_h_advances_func = _hb_font_funcs_set_glyph_h_advances_func = wasmExports2.hb_font_funcs_set_glyph_h_advances_func, Module2._hb_font_funcs_set_glyph_v_advances_func = _hb_font_funcs_set_glyph_v_advances_func = wasmExports2.hb_font_funcs_set_glyph_v_advances_func, Module2._hb_font_funcs_set_glyph_h_origin_func = _hb_font_funcs_set_glyph_h_origin_func = wasmExports2.hb_font_funcs_set_glyph_h_origin_func, Module2._hb_font_funcs_set_glyph_v_origin_func = _hb_font_funcs_set_glyph_v_origin_func = wasmExports2.hb_font_funcs_set_glyph_v_origin_func, Module2._hb_font_funcs_set_glyph_h_kerning_func = _hb_font_funcs_set_glyph_h_kerning_func = wasmExports2.hb_font_funcs_set_glyph_h_kerning_func, Module2._hb_font_funcs_set_glyph_extents_func = _hb_font_funcs_set_glyph_extents_func = wasmExports2.hb_font_funcs_set_glyph_extents_func, Module2._hb_font_funcs_set_glyph_name_func = _hb_font_funcs_set_glyph_name_func = wasmExports2.hb_font_funcs_set_glyph_name_func, Module2._hb_font_funcs_set_glyph_from_name_func = _hb_font_funcs_set_glyph_from_name_func = wasmExports2.hb_font_funcs_set_glyph_from_name_func, Module2._hb_font_get_h_extents = _hb_font_get_h_extents = wasmExports2.hb_font_get_h_extents, Module2._hb_font_get_v_extents = _hb_font_get_v_extents = wasmExports2.hb_font_get_v_extents, Module2._hb_font_get_glyph = _hb_font_get_glyph = wasmExports2.hb_font_get_glyph, Module2._hb_font_get_nominal_glyph = _hb_font_get_nominal_glyph = wasmExports2.hb_font_get_nominal_glyph, Module2._hb_font_get_variation_glyph = _hb_font_get_variation_glyph = wasmExports2.hb_font_get_variation_glyph, Module2._hb_font_get_glyph_h_advance = _hb_font_get_glyph_h_advance = wasmExports2.hb_font_get_glyph_h_advance, Module2._hb_font_get_glyph_v_advance = _hb_font_get_glyph_v_advance = wasmExports2.hb_font_get_glyph_v_advance, Module2._hb_font_get_glyph_h_origin = _hb_font_get_glyph_h_origin = wasmExports2.hb_font_get_glyph_h_origin, Module2._hb_font_get_glyph_v_origin = _hb_font_get_glyph_v_origin = wasmExports2.hb_font_get_glyph_v_origin, Module2._hb_font_get_glyph_extents = _hb_font_get_glyph_extents = wasmExports2.hb_font_get_glyph_extents, Module2._hb_font_get_glyph_from_name = _hb_font_get_glyph_from_name = wasmExports2.hb_font_get_glyph_from_name, Module2._hb_font_draw_glyph_or_fail = _hb_font_draw_glyph_or_fail = wasmExports2.hb_font_draw_glyph_or_fail, Module2._hb_font_paint_glyph_or_fail = _hb_font_paint_glyph_or_fail = wasmExports2.hb_font_paint_glyph_or_fail, Module2._hb_font_draw_glyph = _hb_font_draw_glyph = wasmExports2.hb_font_draw_glyph, Module2._hb_font_paint_glyph = _hb_font_paint_glyph = wasmExports2.hb_font_paint_glyph, Module2._hb_font_glyph_to_string = _hb_font_glyph_to_string = wasmExports2.hb_font_glyph_to_string, Module2._hb_font_create = _hb_font_create = wasmExports2.hb_font_create, Module2._hb_font_set_variations = _hb_font_set_variations = wasmExports2.hb_font_set_variations, Module2._hb_font_create_sub_font = _hb_font_create_sub_font = wasmExports2.hb_font_create_sub_font, Module2._hb_font_reference = _hb_font_reference = wasmExports2.hb_font_reference, Module2._hb_font_destroy = _hb_font_destroy = wasmExports2.hb_font_destroy, Module2._hb_font_get_face = _hb_font_get_face = wasmExports2.hb_font_get_face, Module2._hb_font_set_funcs = _hb_font_set_funcs = wasmExports2.hb_font_set_funcs, Module2._hb_font_set_scale = _hb_font_set_scale = wasmExports2.hb_font_set_scale, Module2._hb_ot_color_has_palettes = _hb_ot_color_has_palettes = wasmExports2.hb_ot_color_has_palettes, Module2._hb_ot_color_palette_get_count = _hb_ot_color_palette_get_count = wasmExports2.hb_ot_color_palette_get_count, Module2._hb_ot_color_palette_get_name_id = _hb_ot_color_palette_get_name_id = wasmExports2.hb_ot_color_palette_get_name_id, Module2._hb_ot_color_palette_color_get_name_id = _hb_ot_color_palette_color_get_name_id = wasmExports2.hb_ot_color_palette_color_get_name_id, Module2._hb_ot_color_palette_get_flags = _hb_ot_color_palette_get_flags = wasmExports2.hb_ot_color_palette_get_flags, Module2._hb_ot_color_palette_get_colors = _hb_ot_color_palette_get_colors = wasmExports2.hb_ot_color_palette_get_colors, Module2._hb_ot_color_has_layers = _hb_ot_color_has_layers = wasmExports2.hb_ot_color_has_layers, Module2._hb_ot_color_has_paint = _hb_ot_color_has_paint = wasmExports2.hb_ot_color_has_paint, Module2._hb_ot_color_glyph_has_paint = _hb_ot_color_glyph_has_paint = wasmExports2.hb_ot_color_glyph_has_paint, Module2._hb_ot_color_glyph_get_layers = _hb_ot_color_glyph_get_layers = wasmExports2.hb_ot_color_glyph_get_layers, Module2._hb_ot_color_has_png = _hb_ot_color_has_png = wasmExports2.hb_ot_color_has_png, Module2._hb_ot_color_glyph_reference_png = _hb_ot_color_glyph_reference_png = wasmExports2.hb_ot_color_glyph_reference_png, Module2._hb_ot_layout_get_glyph_class = _hb_ot_layout_get_glyph_class = wasmExports2.hb_ot_layout_get_glyph_class, Module2._hb_ot_layout_get_ligature_carets = _hb_ot_layout_get_ligature_carets = wasmExports2.hb_ot_layout_get_ligature_carets, Module2._hb_ot_layout_table_get_script_tags = _hb_ot_layout_table_get_script_tags = wasmExports2.hb_ot_layout_table_get_script_tags, Module2._hb_ot_layout_table_get_feature_tags = _hb_ot_layout_table_get_feature_tags = wasmExports2.hb_ot_layout_table_get_feature_tags, Module2._hb_ot_layout_script_get_language_tags = _hb_ot_layout_script_get_language_tags = wasmExports2.hb_ot_layout_script_get_language_tags, Module2._hb_ot_layout_language_get_feature_tags = _hb_ot_layout_language_get_feature_tags = wasmExports2.hb_ot_layout_language_get_feature_tags, Module2._hb_ot_layout_feature_get_lookups = _hb_ot_layout_feature_get_lookups = wasmExports2.hb_ot_layout_feature_get_lookups, Module2._hb_ot_layout_feature_get_name_ids = _hb_ot_layout_feature_get_name_ids = wasmExports2.hb_ot_layout_feature_get_name_ids, Module2._hb_ot_metrics_get_position_with_fallback = _hb_ot_metrics_get_position_with_fallback = wasmExports2.hb_ot_metrics_get_position_with_fallback, Module2._hb_ot_layout_lookup_get_optical_bound = _hb_ot_layout_lookup_get_optical_bound = wasmExports2.hb_ot_layout_lookup_get_optical_bound, Module2._hb_ot_metrics_get_position = _hb_ot_metrics_get_position = wasmExports2.hb_ot_metrics_get_position, Module2._hb_ot_metrics_get_variation = _hb_ot_metrics_get_variation = wasmExports2.hb_ot_metrics_get_variation, Module2._hb_ot_metrics_get_x_variation = _hb_ot_metrics_get_x_variation = wasmExports2.hb_ot_metrics_get_x_variation, Module2._hb_ot_metrics_get_y_variation = _hb_ot_metrics_get_y_variation = wasmExports2.hb_ot_metrics_get_y_variation, Module2._hb_ot_name_list_names = _hb_ot_name_list_names = wasmExports2.hb_ot_name_list_names, Module2._hb_ot_name_get_utf16 = _hb_ot_name_get_utf16 = wasmExports2.hb_ot_name_get_utf16, Module2._hb_set_create = _hb_set_create = wasmExports2.hb_set_create, Module2._hb_set_destroy = _hb_set_destroy = wasmExports2.hb_set_destroy, Module2._hb_ot_tag_to_script = _hb_ot_tag_to_script = wasmExports2.hb_ot_tag_to_script, Module2._hb_ot_tag_to_language = _hb_ot_tag_to_language = wasmExports2.hb_ot_tag_to_language, Module2._hb_ot_var_get_axis_infos = _hb_ot_var_get_axis_infos = wasmExports2.hb_ot_var_get_axis_infos, Module2._hb_paint_funcs_set_push_transform_func = _hb_paint_funcs_set_push_transform_func = wasmExports2.hb_paint_funcs_set_push_transform_func, Module2._hb_paint_funcs_set_pop_transform_func = _hb_paint_funcs_set_pop_transform_func = wasmExports2.hb_paint_funcs_set_pop_transform_func, Module2._hb_paint_funcs_set_color_glyph_func = _hb_paint_funcs_set_color_glyph_func = wasmExports2.hb_paint_funcs_set_color_glyph_func, Module2._hb_paint_funcs_set_push_clip_glyph_func = _hb_paint_funcs_set_push_clip_glyph_func = wasmExports2.hb_paint_funcs_set_push_clip_glyph_func, Module2._hb_paint_funcs_set_push_clip_rectangle_func = _hb_paint_funcs_set_push_clip_rectangle_func = wasmExports2.hb_paint_funcs_set_push_clip_rectangle_func, Module2._hb_paint_funcs_set_pop_clip_func = _hb_paint_funcs_set_pop_clip_func = wasmExports2.hb_paint_funcs_set_pop_clip_func, Module2._hb_paint_funcs_set_color_func = _hb_paint_funcs_set_color_func = wasmExports2.hb_paint_funcs_set_color_func, Module2._hb_paint_funcs_set_image_func = _hb_paint_funcs_set_image_func = wasmExports2.hb_paint_funcs_set_image_func, Module2._hb_paint_funcs_set_linear_gradient_func = _hb_paint_funcs_set_linear_gradient_func = wasmExports2.hb_paint_funcs_set_linear_gradient_func, Module2._hb_paint_funcs_set_radial_gradient_func = _hb_paint_funcs_set_radial_gradient_func = wasmExports2.hb_paint_funcs_set_radial_gradient_func, Module2._hb_paint_funcs_set_sweep_gradient_func = _hb_paint_funcs_set_sweep_gradient_func = wasmExports2.hb_paint_funcs_set_sweep_gradient_func, Module2._hb_paint_funcs_set_push_group_func = _hb_paint_funcs_set_push_group_func = wasmExports2.hb_paint_funcs_set_push_group_func, Module2._hb_paint_funcs_set_pop_group_func = _hb_paint_funcs_set_pop_group_func = wasmExports2.hb_paint_funcs_set_pop_group_func, Module2._hb_paint_funcs_set_custom_palette_color_func = _hb_paint_funcs_set_custom_palette_color_func = wasmExports2.hb_paint_funcs_set_custom_palette_color_func, Module2._hb_paint_funcs_create = _hb_paint_funcs_create = wasmExports2.hb_paint_funcs_create, Module2._hb_paint_funcs_destroy = _hb_paint_funcs_destroy = wasmExports2.hb_paint_funcs_destroy, Module2._hb_color_line_get_color_stops = _hb_color_line_get_color_stops = wasmExports2.hb_color_line_get_color_stops, Module2._hb_color_line_get_extend = _hb_color_line_get_extend = wasmExports2.hb_color_line_get_extend, Module2._hb_set_get_population = _hb_set_get_population = wasmExports2.hb_set_get_population, Module2._hb_set_next_many = _hb_set_next_many = wasmExports2.hb_set_next_many, Module2._hb_shape = _hb_shape = wasmExports2.hb_shape, __emscripten_timeout = wasmExports2._emscripten_timeout, __emscripten_stack_restore = wasmExports2._emscripten_stack_restore, __emscripten_stack_alloc = wasmExports2._emscripten_stack_alloc, _emscripten_stack_get_current = wasmExports2.emscripten_stack_get_current;
  }
  var wasmImports = { _abort_js: __abort_js, _emscripten_runtime_keepalive_clear: __emscripten_runtime_keepalive_clear, _setitimer_js: __setitimer_js, emscripten_resize_heap: _emscripten_resize_heap, proc_exit: _proc_exit }, wasmExports = await createWasm();
  function run() {
    if (runDependencies > 0) {
      dependenciesFulfilled = run;
      return;
    }
    if (preRun(), runDependencies > 0) {
      dependenciesFulfilled = run;
      return;
    }
    function doRun() {
      Module2.calledRun = !0, !ABORT && (initRuntime(), readyPromiseResolve?.(Module2), Module2.onRuntimeInitialized?.(), postRun());
    }
    Module2.setStatus ? (Module2.setStatus("Running..."), setTimeout(() => {
      setTimeout(() => Module2.setStatus(""), 1), doRun();
    }, 1)) : doRun();
  }
  function preInit() {
    if (Module2.preInit)
      for (typeof Module2.preInit == "function" && (Module2.preInit = [Module2.preInit]); Module2.preInit.length > 0; )
        Module2.preInit.shift()();
  }
  return preInit(), run(), runtimeInitialized ? moduleRtn = Module2 : moduleRtn = new Promise((resolve, reject) => {
    readyPromiseResolve = resolve, readyPromiseReject = reject;
  }), moduleRtn;
}
var harfbuzz_default = createHarfBuzz;

// node_modules/harfbuzzjs/dist/index.mjs
var Module, exports, freeFuncPtr, utf8Decoder = new TextDecoder("utf8"), utf8Encoder = new TextEncoder(), registry = new FinalizationRegistry((cleanup) => {
  cleanup();
});
function track(obj, destroy) {
  let ptr = obj.ptr;
  registry.register(obj, () => destroy(ptr));
}
function init(module) {
  Module = module, exports = Module.wasmExports, freeFuncPtr = Module.addFunction((ptr) => {
    exports.free(ptr);
  }, "vi");
}
function hb_tag(s) {
  return (s.charCodeAt(0) & 255) << 24 | (s.charCodeAt(1) & 255) << 16 | (s.charCodeAt(2) & 255) << 8 | (s.charCodeAt(3) & 255) << 0;
}
function hb_untag(tag) {
  return [
    String.fromCharCode(tag >> 24 & 255),
    String.fromCharCode(tag >> 16 & 255),
    String.fromCharCode(tag >> 8 & 255),
    String.fromCharCode(tag >> 0 & 255)
  ].join("");
}
function utf8_ptr_to_string(ptr, length) {
  let end;
  return length == null ? end = Module.HEAPU8.indexOf(0, ptr) : end = ptr + length, utf8Decoder.decode(Module.HEAPU8.subarray(ptr, end));
}
function utf16_ptr_to_string(ptr, length) {
  let end = ptr / 2 + length;
  return String.fromCharCode(...Module.HEAPU16.subarray(ptr / 2, end));
}
function string_to_ascii_ptr(text) {
  let ptr = exports.malloc(text.length + 1);
  for (let i = 0; i < text.length; ++i) {
    let char = text.charCodeAt(i);
    if (char > 127) throw new Error("Expected ASCII text");
    Module.HEAPU8[ptr + i] = char;
  }
  return Module.HEAPU8[ptr + text.length] = 0, {
    ptr,
    length: text.length,
    free: function() {
      exports.free(ptr);
    }
  };
}
function string_to_utf8_ptr(text) {
  let ptr = exports.malloc(text.length);
  return utf8Encoder.encodeInto(text, Module.HEAPU8.subarray(ptr, ptr + text.length)), {
    ptr,
    length: text.length,
    free: function() {
      exports.free(ptr);
    }
  };
}
function string_to_utf16_ptr(text) {
  let ptr = exports.malloc(text.length * 2), words = Module.HEAPU16.subarray(ptr / 2, ptr / 2 + text.length);
  for (let i = 0; i < words.length; ++i) words[i] = text.charCodeAt(i);
  return {
    ptr,
    length: words.length,
    free: function() {
      exports.free(ptr);
    }
  };
}
function language_to_string(language) {
  return utf8_ptr_to_string(exports.hb_language_to_string(language));
}
function language_from_string(str) {
  let languageStr = string_to_ascii_ptr(str), languagePtr = exports.hb_language_from_string(languageStr.ptr, -1);
  return languageStr.free(), languagePtr;
}
function typed_array_from_set(setPtr) {
  let setCount = exports.hb_set_get_population(setPtr), arrayPtr = exports.malloc(setCount << 2), arrayOffset = arrayPtr >> 2;
  return exports.hb_set_next_many(setPtr, -1, arrayPtr, setCount), Module.HEAPU32.subarray(arrayOffset, arrayOffset + setCount);
}
var callbackData = [void 0], freeCallbackData = [];
function register_callback_data_pointer(data) {
  if (data === void 0) return 0;
  let dataPtr = freeCallbackData.pop() ?? callbackData.length;
  return callbackData[dataPtr] = data, dataPtr;
}
function get_callback_data(dataPtr) {
  return callbackData[dataPtr];
}
function remove_callback_data_pointer(dataPtr) {
  dataPtr !== 0 && (callbackData[dataPtr] = void 0, freeCallbackData.push(dataPtr));
}
function color_from_int(color) {
  return {
    red: color >> 8 & 255,
    green: color >> 16 & 255,
    blue: color >> 24 & 255,
    alpha: color & 255
  };
}
function color_to_int(color) {
  return (color.red << 8 | color.green << 16 | color.blue << 24 | color.alpha) >>> 0;
}
var ColorPaletteFlags = {
  DEFAULT: 0,
  USABLE_WITH_LIGHT_BACKGROUND: 1,
  USABLE_WITH_DARK_BACKGROUND: 2
}, PaintExtend = {
  PAD: 0,
  REPEAT: 1,
  REFLECT: 2
}, PaintCompositeMode = {
  CLEAR: 0,
  SRC: 1,
  DEST: 2,
  SRC_OVER: 3,
  DEST_OVER: 4,
  SRC_IN: 5,
  DEST_IN: 6,
  SRC_OUT: 7,
  DEST_OUT: 8,
  SRC_ATOP: 9,
  DEST_ATOP: 10,
  XOR: 11,
  PLUS: 12,
  SCREEN: 13,
  OVERLAY: 14,
  DARKEN: 15,
  LIGHTEN: 16,
  COLOR_DODGE: 17,
  COLOR_BURN: 18,
  HARD_LIGHT: 19,
  SOFT_LIGHT: 20,
  DIFFERENCE: 21,
  EXCLUSION: 22,
  MULTIPLY: 23,
  HSL_HUE: 24,
  HSL_SATURATION: 25,
  HSL_COLOR: 26,
  HSL_LUMINOSITY: 27
}, AxisFlags = { HIDDEN: 1 }, GlyphFlag = {
  UNSAFE_TO_BREAK: 1,
  UNSAFE_TO_CONCAT: 2,
  SAFE_TO_INSERT_TATWEEL: 4,
  DEFINED: 7
}, Blob = class {
  /**
  * @param data Binary font data.
  */
  constructor(data) {
    let array = data instanceof Uint8Array ? data : new Uint8Array(data), blobPtr = exports.malloc(array.byteLength);
    Module.HEAPU8.set(array, blobPtr), this.ptr = exports.hb_blob_create(blobPtr, array.byteLength, 2, blobPtr, freeFuncPtr), track(this, exports.hb_blob_destroy);
  }
}, HB_OT_NAME_ID_INVALID = 65535, GlyphClass = {
  UNCLASSIFIED: 0,
  BASE_GLYPH: 1,
  LIGATURE: 2,
  MARK: 3,
  COMPONENT: 4
}, Face = class {
  constructor(arg, index = 0) {
    typeof arg == "number" ? this.ptr = exports.hb_face_reference(arg) : this.ptr = exports.hb_face_create(arg.ptr, index), this.upem = exports.hb_face_get_upem(this.ptr), track(this, exports.hb_face_destroy);
  }
  /**
  * Return the binary contents of an OpenType table.
  * @param table Table name
  * @returns A Uint8Array of the table data, or undefined if the table is not found.
  */
  referenceTable(table) {
    let blob = exports.hb_face_reference_table(this.ptr, hb_tag(table)), length = exports.hb_blob_get_length(blob);
    if (!length) return;
    let blobptr = exports.hb_blob_get_data(blob, 0);
    return Module.HEAPU8.subarray(blobptr, blobptr + length);
  }
  /**
  * Return variation axis infos.
  * @returns A dictionary mapping axis tags to {@link AxisInfo} values.
  */
  getAxisInfos() {
    let sp = Module.stackSave(), axis = Module.stackAlloc(2048), c = Module.stackAlloc(4);
    Module.HEAPU32[c / 4] = 64, exports.hb_ot_var_get_axis_infos(this.ptr, 0, c, axis);
    let result = {};
    return Array.from({ length: Module.HEAPU32[c / 4] }).forEach((_, i) => {
      let info = {
        axisIndex: Module.HEAPU32[axis / 4 + i * 8],
        tag: hb_untag(Module.HEAPU32[axis / 4 + i * 8 + 1]),
        nameId: Module.HEAPU32[axis / 4 + i * 8 + 2],
        flags: Module.HEAPU32[axis / 4 + i * 8 + 3],
        min: Module.HEAPF32[axis / 4 + i * 8 + 4],
        default: Module.HEAPF32[axis / 4 + i * 8 + 5],
        max: Module.HEAPF32[axis / 4 + i * 8 + 6]
      };
      result[info.tag] = info;
    }), Module.stackRestore(sp), result;
  }
  /**
  * Return unicodes the face supports.
  * @returns A Uint32Array of supported Unicode code points.
  */
  collectUnicodes() {
    let unicodeSetPtr = exports.hb_set_create();
    exports.hb_face_collect_unicodes(this.ptr, unicodeSetPtr);
    let result = typed_array_from_set(unicodeSetPtr);
    return exports.hb_set_destroy(unicodeSetPtr), result;
  }
  /**
  * Return all scripts enumerated in the specified face's
  * GSUB table or GPOS table.
  * @param table The table to query, either "GSUB" or "GPOS".
  * @returns An array of 4-character script tag strings.
  */
  getTableScriptTags(table) {
    let sp = Module.stackSave(), tableTag = hb_tag(table), startOffset = 0, scriptCount = 128, scriptCountPtr = Module.stackAlloc(4), scriptTagsPtr = Module.stackAlloc(512), tags = [];
    for (; scriptCount == 128; ) {
      Module.HEAPU32[scriptCountPtr / 4] = scriptCount, exports.hb_ot_layout_table_get_script_tags(this.ptr, tableTag, startOffset, scriptCountPtr, scriptTagsPtr), scriptCount = Module.HEAPU32[scriptCountPtr / 4];
      let scriptTags = Module.HEAPU32.subarray(scriptTagsPtr / 4, scriptTagsPtr / 4 + scriptCount);
      tags.push(...Array.from(scriptTags).map(hb_untag)), startOffset += scriptCount;
    }
    return Module.stackRestore(sp), tags;
  }
  /**
  * Return all features enumerated in the specified face's
  * GSUB table or GPOS table.
  * @param table The table to query, either "GSUB" or "GPOS".
  * @returns An array of 4-character feature tag strings.
  */
  getTableFeatureTags(table) {
    let sp = Module.stackSave(), tableTag = hb_tag(table), startOffset = 0, featureCount = 128, featureCountPtr = Module.stackAlloc(4), featureTagsPtr = Module.stackAlloc(512), tags = [];
    for (; featureCount == 128; ) {
      Module.HEAPU32[featureCountPtr / 4] = featureCount, exports.hb_ot_layout_table_get_feature_tags(this.ptr, tableTag, startOffset, featureCountPtr, featureTagsPtr), featureCount = Module.HEAPU32[featureCountPtr / 4];
      let featureTags = Module.HEAPU32.subarray(featureTagsPtr / 4, featureTagsPtr / 4 + featureCount);
      tags.push(...Array.from(featureTags).map(hb_untag)), startOffset += featureCount;
    }
    return Module.stackRestore(sp), tags;
  }
  /**
  * Return language tags in the given face's GSUB or GPOS table, underneath
  * the specified script index.
  * @param table The table to query, either "GSUB" or "GPOS".
  * @param scriptIndex The index of the script to query.
  * @returns An array of 4-character language tag strings.
  */
  getScriptLanguageTags(table, scriptIndex) {
    let sp = Module.stackSave(), tableTag = hb_tag(table), startOffset = 0, languageCount = 128, languageCountPtr = Module.stackAlloc(4), languageTagsPtr = Module.stackAlloc(512), tags = [];
    for (; languageCount == 128; ) {
      Module.HEAPU32[languageCountPtr / 4] = languageCount, exports.hb_ot_layout_script_get_language_tags(this.ptr, tableTag, scriptIndex, startOffset, languageCountPtr, languageTagsPtr), languageCount = Module.HEAPU32[languageCountPtr / 4];
      let languageTags = Module.HEAPU32.subarray(languageTagsPtr / 4, languageTagsPtr / 4 + languageCount);
      tags.push(...Array.from(languageTags).map(hb_untag)), startOffset += languageCount;
    }
    return Module.stackRestore(sp), tags;
  }
  /**
  * Return all features in the specified face's GSUB table or GPOS table,
  * underneath the specified script and language.
  * @param table The table to query, either "GSUB" or "GPOS".
  * @param scriptIndex The index of the script to query.
  * @param languageIndex The index of the language to query.
  * @returns An array of 4-character feature tag strings.
  */
  getLanguageFeatureTags(table, scriptIndex, languageIndex) {
    let sp = Module.stackSave(), tableTag = hb_tag(table), startOffset = 0, featureCount = 128, featureCountPtr = Module.stackAlloc(4), featureTagsPtr = Module.stackAlloc(512), tags = [];
    for (; featureCount == 128; ) {
      Module.HEAPU32[featureCountPtr / 4] = featureCount, exports.hb_ot_layout_language_get_feature_tags(this.ptr, tableTag, scriptIndex, languageIndex, startOffset, featureCountPtr, featureTagsPtr), featureCount = Module.HEAPU32[featureCountPtr / 4];
      let featureTags = Module.HEAPU32.subarray(featureTagsPtr / 4, featureTagsPtr / 4 + featureCount);
      tags.push(...Array.from(featureTags).map(hb_untag)), startOffset += featureCount;
    }
    return Module.stackRestore(sp), tags;
  }
  /**
  * Fetches a list of all lookups enumerated for the specified feature, in
  * the specified face's GSUB table or GPOS table.
  * @param table The table to query, either "GSUB" or "GPOS".
  * @param featureIndex The index of the requested feature.
  * @returns An array of lookup indexes.
  */
  getFeatureLookups(table, featureIndex) {
    let sp = Module.stackSave(), tableTag = hb_tag(table), startOffset = 0, lookupCount = 128, lookupCountPtr = Module.stackAlloc(4), lookupIndexesPtr = Module.stackAlloc(512), lookups = [];
    for (; lookupCount == 128; ) {
      Module.HEAPU32[lookupCountPtr / 4] = lookupCount, exports.hb_ot_layout_feature_get_lookups(this.ptr, tableTag, featureIndex, startOffset, lookupCountPtr, lookupIndexesPtr), lookupCount = Module.HEAPU32[lookupCountPtr / 4];
      let lookupIndexes = Module.HEAPU32.subarray(lookupIndexesPtr / 4, lookupIndexesPtr / 4 + lookupCount);
      lookups.push(...Array.from(lookupIndexes)), startOffset += lookupCount;
    }
    return Module.stackRestore(sp), lookups;
  }
  /**
  * Get the GDEF class of the requested glyph.
  * @param glyph The glyph to get the class of.
  * @returns The {@link GlyphClass} of the glyph.
  */
  getGlyphClass(glyph) {
    return exports.hb_ot_layout_get_glyph_class(this.ptr, glyph);
  }
  /**
  * Return all names in the specified face's name table.
  * @returns An array of {nameId, language} entries.
  */
  listNames() {
    let sp = Module.stackSave(), numEntriesPtr = Module.stackAlloc(4), entriesPtr = exports.hb_ot_name_list_names(this.ptr, numEntriesPtr), numEntries = Module.HEAPU32[numEntriesPtr / 4], entries = [];
    for (let i = 0; i < numEntries; i++) entries.push({
      nameId: Module.HEAPU32[entriesPtr / 4 + i * 3],
      language: language_to_string(Module.HEAPU32[entriesPtr / 4 + i * 3 + 2])
    });
    return Module.stackRestore(sp), entries;
  }
  /**
  * Get the name of the specified face.
  * @param nameId The ID of the name to get.
  * @param language The language of the name to get.
  * @returns The name string.
  */
  getName(nameId, language) {
    let sp = Module.stackSave(), languagePtr = language_from_string(language), nameLen = exports.hb_ot_name_get_utf16(this.ptr, nameId, languagePtr, 0, 0) + 1, textSizePtr = Module.stackAlloc(4), textPtr = exports.malloc(nameLen * 2);
    Module.HEAPU32[textSizePtr / 4] = nameLen, exports.hb_ot_name_get_utf16(this.ptr, nameId, languagePtr, textSizePtr, textPtr);
    let name = utf16_ptr_to_string(textPtr, nameLen - 1);
    return exports.free(textPtr), Module.stackRestore(sp), name;
  }
  /**
  * Get the name IDs of the specified feature.
  * @param table The table to query, either "GSUB" or "GPOS".
  * @param featureIndex The index of the feature to query.
  * @returns An object with name IDs, or undefined if not found.
  */
  getFeatureNameIds(table, featureIndex) {
    let sp = Module.stackSave(), tableTag = hb_tag(table), labelIdPtr = Module.stackAlloc(4), tooltipIdPtr = Module.stackAlloc(4), sampleIdPtr = Module.stackAlloc(4), numNamedParametersPtr = Module.stackAlloc(4), firstParameterIdPtr = Module.stackAlloc(4), found = exports.hb_ot_layout_feature_get_name_ids(this.ptr, tableTag, featureIndex, labelIdPtr, tooltipIdPtr, sampleIdPtr, numNamedParametersPtr, firstParameterIdPtr), names;
    if (found) {
      let uiLabelNameId = Module.HEAPU32[labelIdPtr / 4], uiTooltipTextNameId = Module.HEAPU32[tooltipIdPtr / 4], sampleTextNameId = Module.HEAPU32[sampleIdPtr / 4], numNamedParameters = Module.HEAPU32[numNamedParametersPtr / 4], firstParameterId = Module.HEAPU32[firstParameterIdPtr / 4];
      names = { paramUiLabelNameIds: Array.from({ length: numNamedParameters }, (_, i) => firstParameterId + i) }, uiLabelNameId != HB_OT_NAME_ID_INVALID && (names.uiLabelNameId = uiLabelNameId), uiTooltipTextNameId != HB_OT_NAME_ID_INVALID && (names.uiTooltipTextNameId = uiTooltipTextNameId), sampleTextNameId != HB_OT_NAME_ID_INVALID && (names.sampleTextNameId = sampleTextNameId);
    }
    return Module.stackRestore(sp), names;
  }
  /**
  * Tests whether a face includes a `CPAL` color-palette table.
  * @returns `true` if data found, `false` otherwise.
  */
  hasColorPalettes() {
    return !!exports.hb_ot_color_has_palettes(this.ptr);
  }
  /**
  * Fetches the color palettes in the face's `CPAL` table.
  * @returns An array of the face's {@link ColorPalette | color palettes}.
  */
  getColorPalettes() {
    let count = exports.hb_ot_color_palette_get_count(this.ptr), palettes = [], sp = Module.stackSave(), countPtr = Module.stackAlloc(4), colorsPtr = Module.stackAlloc(512);
    for (let i = 0; i < count; i++) {
      let colors = [], startOffset = 0, colorCount = 128;
      for (; colorCount === 128; ) {
        Module.HEAPU32[countPtr / 4] = colorCount, exports.hb_ot_color_palette_get_colors(this.ptr, i, startOffset, countPtr, colorsPtr), colorCount = Module.HEAPU32[countPtr / 4];
        for (let j = 0; j < colorCount; j++) {
          let color = color_from_int(Module.HEAPU32[colorsPtr / 4 + j]), nameId2 = exports.hb_ot_color_palette_color_get_name_id(this.ptr, startOffset + j);
          nameId2 != HB_OT_NAME_ID_INVALID && (color.nameId = nameId2), colors.push(color);
        }
        startOffset += colorCount;
      }
      let palette = {
        colors,
        flags: exports.hb_ot_color_palette_get_flags(this.ptr, i)
      }, nameId = exports.hb_ot_color_palette_get_name_id(this.ptr, i);
      nameId != HB_OT_NAME_ID_INVALID && (palette.nameId = nameId), palettes.push(palette);
    }
    return Module.stackRestore(sp), palettes;
  }
  /**
  * Tests whether a face includes a `COLR` table with data according to COLRv0.
  * @returns `true` if data found, `false` otherwise.
  */
  hasColorLayers() {
    return !!exports.hb_ot_color_has_layers(this.ptr);
  }
  /**
  * Fetches a list of all color layers for the specified glyph index in the
  * specified face.
  * @param glyph The glyph index to query.
  * @returns An array of the glyph's {@link ColorLayer | color layers}.
  */
  getGlyphColorLayers(glyph) {
    let layers = [], sp = Module.stackSave(), countPtr = Module.stackAlloc(4), layersPtr = Module.stackAlloc(1024), startOffset = 0, layerCount = 128;
    for (; layerCount === 128; ) {
      Module.HEAPU32[countPtr / 4] = layerCount, exports.hb_ot_color_glyph_get_layers(this.ptr, glyph, startOffset, countPtr, layersPtr), layerCount = Module.HEAPU32[countPtr / 4];
      for (let i = 0; i < layerCount; i++) {
        let o = layersPtr / 4 + i * 2, layer = { glyph: Module.HEAPU32[o] }, colorIndex = Module.HEAPU32[o + 1];
        colorIndex != 65535 && (layer.colorIndex = colorIndex), layers.push(layer);
      }
      startOffset += layerCount;
    }
    return Module.stackRestore(sp), layers;
  }
  /**
  * Tests whether a face includes a `COLR` table with data according to COLRv1.
  * @returns `true` if data found, `false` otherwise.
  */
  hasColorPaint() {
    return !!exports.hb_ot_color_has_paint(this.ptr);
  }
  /**
  * Tests whether a face includes COLRv1 paint data for a glyph.
  * @param glyph The glyph index to query.
  * @returns `true` if data found, `false` otherwise.
  */
  glyphHasColorPaint(glyph) {
    return !!exports.hb_ot_color_glyph_has_paint(this.ptr, glyph);
  }
  /**
  * Tests whether a face has PNG glyph images (either in `CBDT` or `sbix`
  * tables).
  * @returns `true` if data found, `false` otherwise.
  */
  hasColorPng() {
    return !!exports.hb_ot_color_has_png(this.ptr);
  }
}, DrawFuncs = class {
  constructor() {
    this.funcPtrs = [], this.userDataPtrs = [], this.ptr = exports.hb_draw_funcs_create();
    let ptr = this.ptr, funcPtrs = this.funcPtrs, userDataPtrs = this.userDataPtrs;
    registry.register(this, () => {
      exports.hb_draw_funcs_destroy(ptr);
      for (let ptr2 of funcPtrs) Module.removeFunction(ptr2);
      for (let ptr2 of userDataPtrs) remove_callback_data_pointer(ptr2);
    });
  }
  /**
  * Sets move-to callback to the draw functions object.
  * @param func The move-to callback.
  * @param userData Data to pass to `func`.
  */
  setMoveToFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((dfuncs, draw_data, draw_state, toX, toY, user_data) => {
      func(toX, toY, get_callback_data(draw_data), get_callback_data(user_data));
    }, "viiiffi");
    this.funcPtrs.push(funcPtr), exports.hb_draw_funcs_set_move_to_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets line-to callback to the draw functions object.
  * @param func The line-to callback.
  * @param userData Data to pass to `func`.
  */
  setLineToFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((dfuncs, draw_data, draw_state, toX, toY, user_data) => {
      func(toX, toY, get_callback_data(draw_data), get_callback_data(user_data));
    }, "viiiffi");
    this.funcPtrs.push(funcPtr), exports.hb_draw_funcs_set_line_to_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets quadratic-to callback to the draw functions object.
  * @param func The quadratic-to callback.
  * @param userData Data to pass to `func`.
  */
  setQuadraticToFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((dfuncs, draw_data, draw_state, cX, cY, toX, toY, user_data) => {
      func(cX, cY, toX, toY, get_callback_data(draw_data), get_callback_data(user_data));
    }, "viiiffffi");
    this.funcPtrs.push(funcPtr), exports.hb_draw_funcs_set_quadratic_to_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets cubic-to callback to the draw functions object.
  * @param func The cubic-to callback.
  * @param userData Data to pass to `func`.
  */
  setCubicToFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((dfuncs, draw_data, draw_state, c1X, c1Y, c2X, c2Y, toX, toY, user_data) => {
      func(c1X, c1Y, c2X, c2Y, toX, toY, get_callback_data(draw_data), get_callback_data(user_data));
    }, "viiiffffffi");
    this.funcPtrs.push(funcPtr), exports.hb_draw_funcs_set_cubic_to_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets close-path callback to the draw functions object.
  * @param func The close-path callback.
  * @param userData Data to pass to `func`.
  */
  setClosePathFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((dfuncs, draw_data, draw_state, user_data) => {
      func(get_callback_data(draw_data), get_callback_data(user_data));
    }, "viiii");
    this.funcPtrs.push(funcPtr), exports.hb_draw_funcs_set_close_path_func(this.ptr, funcPtr, userDataPtr, 0);
  }
}, MetricsTag = {
  HORIZONTAL_ASCENDER: hb_tag("hasc"),
  HORIZONTAL_DESCENDER: hb_tag("hdsc"),
  HORIZONTAL_LINE_GAP: hb_tag("hlgp"),
  HORIZONTAL_CLIPPING_ASCENT: hb_tag("hcla"),
  HORIZONTAL_CLIPPING_DESCENT: hb_tag("hcld"),
  VERTICAL_ASCENDER: hb_tag("vasc"),
  VERTICAL_DESCENDER: hb_tag("vdsc"),
  VERTICAL_LINE_GAP: hb_tag("vlgp"),
  HORIZONTAL_CARET_RISE: hb_tag("hcrs"),
  HORIZONTAL_CARET_RUN: hb_tag("hcrn"),
  HORIZONTAL_CARET_OFFSET: hb_tag("hcof"),
  VERTICAL_CARET_RISE: hb_tag("vcrs"),
  VERTICAL_CARET_RUN: hb_tag("vcrn"),
  VERTICAL_CARET_OFFSET: hb_tag("vcof"),
  X_HEIGHT: hb_tag("xhgt"),
  CAP_HEIGHT: hb_tag("cpht"),
  SUBSCRIPT_EM_X_SIZE: hb_tag("sbxs"),
  SUBSCRIPT_EM_Y_SIZE: hb_tag("sbys"),
  SUBSCRIPT_EM_X_OFFSET: hb_tag("sbxo"),
  SUBSCRIPT_EM_Y_OFFSET: hb_tag("sbyo"),
  SUPERSCRIPT_EM_X_SIZE: hb_tag("spxs"),
  SUPERSCRIPT_EM_Y_SIZE: hb_tag("spys"),
  SUPERSCRIPT_EM_X_OFFSET: hb_tag("spxo"),
  SUPERSCRIPT_EM_Y_OFFSET: hb_tag("spyo"),
  STRIKEOUT_SIZE: hb_tag("strs"),
  STRIKEOUT_OFFSET: hb_tag("stro"),
  UNDERLINE_SIZE: hb_tag("unds"),
  UNDERLINE_OFFSET: hb_tag("undo")
}, pathDrawFuncs;
function getPathDrawFuncs() {
  return pathDrawFuncs || (pathDrawFuncs = new DrawFuncs(), pathDrawFuncs.setMoveToFunc((x, y, path) => {
    path.push(`M${x},${y}`);
  }), pathDrawFuncs.setLineToFunc((x, y, path) => {
    path.push(`L${x},${y}`);
  }), pathDrawFuncs.setCubicToFunc((c1x, c1y, c2x, c2y, x, y, path) => {
    path.push(`C${c1x},${c1y} ${c2x},${c2y} ${x},${y}`);
  }), pathDrawFuncs.setQuadraticToFunc((cx, cy, x, y, path) => {
    path.push(`Q${cx},${cy} ${x},${y}`);
  }), pathDrawFuncs.setClosePathFunc((path) => {
    path.push("Z");
  })), pathDrawFuncs;
}
var jsonDrawFuncs;
function getJsonDrawFuncs() {
  return jsonDrawFuncs || (jsonDrawFuncs = new DrawFuncs(), jsonDrawFuncs.setMoveToFunc((x, y, commands) => {
    commands.push({
      type: "M",
      values: [x, y]
    });
  }), jsonDrawFuncs.setLineToFunc((x, y, commands) => {
    commands.push({
      type: "L",
      values: [x, y]
    });
  }), jsonDrawFuncs.setCubicToFunc((c1x, c1y, c2x, c2y, x, y, commands) => {
    commands.push({
      type: "C",
      values: [
        c1x,
        c1y,
        c2x,
        c2y,
        x,
        y
      ]
    });
  }), jsonDrawFuncs.setQuadraticToFunc((cx, cy, x, y, commands) => {
    commands.push({
      type: "Q",
      values: [
        cx,
        cy,
        x,
        y
      ]
    });
  }), jsonDrawFuncs.setClosePathFunc((commands) => {
    commands.push({
      type: "Z",
      values: []
    });
  })), jsonDrawFuncs;
}
var Font = class Font2 {
  constructor(arg) {
    typeof arg == "number" ? this.ptr = exports.hb_font_reference(arg) : (this.ptr = exports.hb_font_create(arg.ptr), this._face = arg), track(this, exports.hb_font_destroy);
  }
  /** The {@link Face} associated with this font. */
  get face() {
    return this._face || (this._face = new Face(exports.hb_font_get_face(this.ptr))), this._face;
  }
  /**
  * Create a sub font that inherits this font's properties.
  * @returns A new Font object representing the sub font.
  */
  subFont() {
    return new Font2(exports.hb_font_create_sub_font(this.ptr));
  }
  /**
  * Return font horizontal extents.
  * @returns Object with ascender, descender, and lineGap properties.
  */
  hExtents() {
    let sp = Module.stackSave(), extentsPtr = Module.stackAlloc(48);
    exports.hb_font_get_h_extents(this.ptr, extentsPtr);
    let extents = {
      ascender: Module.HEAP32[extentsPtr / 4],
      descender: Module.HEAP32[extentsPtr / 4 + 1],
      lineGap: Module.HEAP32[extentsPtr / 4 + 2]
    };
    return Module.stackRestore(sp), extents;
  }
  /**
  * Return font vertical extents.
  * @returns Object with ascender, descender, and lineGap properties.
  */
  vExtents() {
    let sp = Module.stackSave(), extentsPtr = Module.stackAlloc(48);
    exports.hb_font_get_v_extents(this.ptr, extentsPtr);
    let extents = {
      ascender: Module.HEAP32[extentsPtr / 4],
      descender: Module.HEAP32[extentsPtr / 4 + 1],
      lineGap: Module.HEAP32[extentsPtr / 4 + 2]
    };
    return Module.stackRestore(sp), extents;
  }
  /**
  * Return glyph name.
  * @param glyphId ID of the requested glyph in the font.
  * @returns The glyph name string.
  */
  glyphName(glyphId) {
    let sp = Module.stackSave(), strSize = 256, strPtr = Module.stackAlloc(strSize);
    exports.hb_font_glyph_to_string(this.ptr, glyphId, strPtr, strSize);
    let name = utf8_ptr_to_string(strPtr);
    return Module.stackRestore(sp), name;
  }
  /**
  * Draws the outline that corresponds to a glyph in the specified font.
  *
  * The outline is returned by way of calls to the callbacks of the `drawFuncs`
  * object, with `drawData` passed to them.
  * @param glyphId The glyph ID.
  * @param drawFuncs The {@link DrawFuncs} to draw to.
  * @param drawData User data to pass to draw callbacks.
  */
  drawGlyph(glyphId, drawFuncs, drawData) {
    let drawDataPtr = register_callback_data_pointer(drawData);
    try {
      exports.hb_font_draw_glyph(this.ptr, glyphId, drawFuncs.ptr, drawDataPtr);
    } finally {
      remove_callback_data_pointer(drawDataPtr);
    }
  }
  /**
  * Draws the outline that corresponds to a glyph in the specified font.
  *
  * This is a newer name for {@link Font.drawGlyph}, that returns `false` if the
  * font has no outlines for the glyph.
  *
  * The outline is returned by way of calls to the callbacks of the `drawFuncs`
  * object, with `drawData` passed to them.
  * @param glyphId The glyph ID.
  * @param drawFuncs The {@link DrawFuncs} to draw to.
  * @param drawData User data to pass to draw callbacks.
  * @returns `true` if the glyph was drawn, `false` otherwise.
  */
  drawGlyphOrFail(glyphId, drawFuncs, drawData) {
    let drawDataPtr = register_callback_data_pointer(drawData);
    try {
      return !!exports.hb_font_draw_glyph_or_fail(this.ptr, glyphId, drawFuncs.ptr, drawDataPtr);
    } finally {
      remove_callback_data_pointer(drawDataPtr);
    }
  }
  /**
  * Paints the glyph. This function is similar to {@link Font.paintGlyphOrFail},
  * but if painting a color glyph failed, it will fall back to painting an
  * outline monochrome glyph.
  *
  * The painting instructions are returned by way of calls to the callbacks of
  * the `paintFuncs` object, with `paintData` passed to them.
  *
  * If the font has color palettes, then `paletteIndex` selects the palette to
  * use. If the font only has one palette, this will be 0.
  * @param glyphId The glyph ID.
  * @param paintFuncs The {@link PaintFuncs} to paint with.
  * @param paintData User data to pass to paint callbacks.
  * @param paletteIndex The index of the font's color palette to use.
  * @param foreground The foreground color, unpremultiplied.
  */
  paintGlyph(glyphId, paintFuncs, paintData, paletteIndex = 0, foreground = {
    red: 0,
    green: 0,
    blue: 0,
    alpha: 255
  }) {
    let paintDataPtr = register_callback_data_pointer(paintData);
    try {
      exports.hb_font_paint_glyph(this.ptr, glyphId, paintFuncs.ptr, paintDataPtr, paletteIndex, color_to_int(foreground));
    } finally {
      remove_callback_data_pointer(paintDataPtr);
    }
  }
  /**
  * Paints a color glyph.
  *
  * Succeeds if the glyph has color paint layers (COLRv0), a color paint graph
  * (COLRv1), or a bitmap image that the font's callbacks render successfully.
  * Returns `false` if the font has no color data for the glyph; the client can
  * then fall back to {@link Font.drawGlyphOrFail} for the monochrome outline.
  *
  * The painting instructions are returned by way of calls to the callbacks of
  * the `paintFuncs` object, with `paintData` passed to them.
  *
  * If the font has color palettes, then `paletteIndex` selects the palette to
  * use. If the font only has one palette, this will be 0.
  * @param glyphId The glyph ID.
  * @param paintFuncs The {@link PaintFuncs} to paint with.
  * @param paintData User data to pass to paint callbacks.
  * @param paletteIndex The index of the font's color palette to use.
  * @param foreground The foreground color, unpremultiplied.
  * @returns `true` if the glyph was painted, `false` otherwise.
  */
  paintGlyphOrFail(glyphId, paintFuncs, paintData, paletteIndex = 0, foreground = {
    red: 0,
    green: 0,
    blue: 0,
    alpha: 255
  }) {
    let paintDataPtr = register_callback_data_pointer(paintData);
    try {
      return !!exports.hb_font_paint_glyph_or_fail(this.ptr, glyphId, paintFuncs.ptr, paintDataPtr, paletteIndex, color_to_int(foreground));
    } finally {
      remove_callback_data_pointer(paintDataPtr);
    }
  }
  /**
  * Fetches the PNG image for a glyph.
  *
  * To get an optimally sized PNG blob, the PPEM values must be set on the font.
  * If PPEM is unset, the blob returned will be the largest PNG available.
  * @param glyphId A glyph index.
  * @returns The PNG image for the glyph, or `undefined` if the glyph has no PNG
  * image.
  */
  getGlyphColorPng(glyphId) {
    let blob = exports.hb_ot_color_glyph_reference_png(this.ptr, glyphId), length = exports.hb_blob_get_length(blob), png;
    if (length) {
      let dataPtr = exports.hb_blob_get_data(blob, 0);
      png = Module.HEAPU8.slice(dataPtr, dataPtr + length);
    }
    return exports.hb_blob_destroy(blob), png;
  }
  /**
  * Return a glyph as an SVG path string.
  * @param glyphId ID of the requested glyph in the font.
  * @returns SVG path data string.
  */
  glyphToPath(glyphId) {
    let path = [];
    return this.drawGlyph(glyphId, getPathDrawFuncs(), path), path.join("");
  }
  /**
  * Return glyph horizontal advance.
  * @param glyphId ID of the requested glyph in the font.
  * @returns The horizontal advance width.
  */
  glyphHAdvance(glyphId) {
    return exports.hb_font_get_glyph_h_advance(this.ptr, glyphId);
  }
  /**
  * Return glyph vertical advance.
  * @param glyphId ID of the requested glyph in the font.
  * @returns The vertical advance height.
  */
  glyphVAdvance(glyphId) {
    return exports.hb_font_get_glyph_v_advance(this.ptr, glyphId);
  }
  /**
  * Return glyph horizontal origin.
  * @param glyphId ID of the requested glyph in the font.
  * @returns [x, y] origin coordinates, or undefined if not available.
  */
  glyphHOrigin(glyphId) {
    let sp = Module.stackSave(), xPtr = Module.stackAlloc(4), yPtr = Module.stackAlloc(4), origin;
    return exports.hb_font_get_glyph_h_origin(this.ptr, glyphId, xPtr, yPtr) && (origin = [Module.HEAP32[xPtr / 4], Module.HEAP32[yPtr / 4]]), Module.stackRestore(sp), origin;
  }
  /**
  * Return glyph vertical origin.
  * @param glyphId ID of the requested glyph in the font.
  * @returns [x, y] origin coordinates, or undefined if not available.
  */
  glyphVOrigin(glyphId) {
    let sp = Module.stackSave(), xPtr = Module.stackAlloc(4), yPtr = Module.stackAlloc(4), origin;
    return exports.hb_font_get_glyph_v_origin(this.ptr, glyphId, xPtr, yPtr) && (origin = [Module.HEAP32[xPtr / 4], Module.HEAP32[yPtr / 4]]), Module.stackRestore(sp), origin;
  }
  /**
  * Return glyph extents.
  * @param glyphId ID of the requested glyph in the font.
  * @returns An object with xBearing, yBearing, width, and height, or undefined.
  */
  glyphExtents(glyphId) {
    let sp = Module.stackSave(), extentsPtr = Module.stackAlloc(16), extents;
    return exports.hb_font_get_glyph_extents(this.ptr, glyphId, extentsPtr) && (extents = {
      xBearing: Module.HEAP32[extentsPtr / 4],
      yBearing: Module.HEAP32[extentsPtr / 4 + 1],
      width: Module.HEAP32[extentsPtr / 4 + 2],
      height: Module.HEAP32[extentsPtr / 4 + 3]
    }), Module.stackRestore(sp), extents;
  }
  /**
  * Fetches the glyph ID for a Unicode code point in the specified
  * font, with an optional variation selector.
  *
  * If `variationSelector` is 0, it is equivalent to
  * {@link Font.nominalGlyph}; otherwise it is equivalent to
  * {@link Font.variationGlyph}.
  *
  * @param unicode The Unicode code point to query.
  * @param variationSelector A variation-selector code point.
  * @returns The glyph ID, or undefined if not found.
  */
  glyph(unicode, variationSelector = 0) {
    let sp = Module.stackSave(), glyphIdPtr = Module.stackAlloc(4), glyphId;
    return exports.hb_font_get_glyph(this.ptr, unicode, variationSelector, glyphIdPtr) && (glyphId = Module.HEAPU32[glyphIdPtr / 4]), Module.stackRestore(sp), glyphId;
  }
  /**
  * Fetches the nominal glyph ID for a Unicode code point in the
  * specified font.
  *
  * This version of the function should not be used to fetch glyph IDs
  * for code points modified by variation selectors. For variation-selector
  * support, use {@link Font.variationGlyph} or {@link Font.glyph}.
  *
  * @param unicode The Unicode code point to query.
  * @returns The glyph ID, or undefined if not found.
  */
  nominalGlyph(unicode) {
    let sp = Module.stackSave(), glyphIdPtr = Module.stackAlloc(4), glyphId;
    return exports.hb_font_get_nominal_glyph(this.ptr, unicode, glyphIdPtr) && (glyphId = Module.HEAPU32[glyphIdPtr / 4]), Module.stackRestore(sp), glyphId;
  }
  /**
  * Fetches the glyph ID for a Unicode code point when followed by
  * by the specified variation-selector code point, in the specified
  * font.
  *
  * @param unicode The Unicode code point to query.
  * @param variationSelector The variation-selector code point to query.
  * @returns The glyph ID, or undefined if not found.
  */
  variationGlyph(unicode, variationSelector) {
    let sp = Module.stackSave(), glyphIdPtr = Module.stackAlloc(4), glyphId;
    return exports.hb_font_get_variation_glyph(this.ptr, unicode, variationSelector, glyphIdPtr) && (glyphId = Module.HEAPU32[glyphIdPtr / 4]), Module.stackRestore(sp), glyphId;
  }
  /**
  * Return glyph ID from name.
  * @param name Name of the requested glyph in the font.
  * @returns The glyph ID, or undefined if not found.
  */
  glyphFromName(name) {
    let sp = Module.stackSave(), glyphIdPtr = Module.stackAlloc(4), namePtr = string_to_utf8_ptr(name), glyphId;
    return exports.hb_font_get_glyph_from_name(this.ptr, namePtr.ptr, namePtr.length, glyphIdPtr) && (glyphId = Module.HEAPU32[glyphIdPtr / 4]), namePtr.free(), Module.stackRestore(sp), glyphId;
  }
  /**
  * Return a glyph as a JSON path string
  * based on format described on https://svgwg.org/specs/paths/#InterfaceSVGPathSegment
  * @param glyphId ID of the requested glyph in the font.
  * @returns An array of path segment objects with type and values.
  */
  glyphToJson(glyphId) {
    let commands = [];
    return this.drawGlyph(glyphId, getJsonDrawFuncs(), commands), commands;
  }
  /**
  * Set the font's scale factor, affecting the position values returned from
  * shaping.
  * @param xScale Units to scale in the X dimension.
  * @param yScale Units to scale in the Y dimension.
  */
  setScale(xScale, yScale) {
    exports.hb_font_set_scale(this.ptr, xScale, yScale);
  }
  /**
  * Applies a list of font-variation settings to a font.
  *
  * Note that this overrides all existing variations set on the font.
  * Axes not included in `variations` will be effectively set to their
  * default values.
  *
  * @param variations Array of variation settings to apply.
  */
  setVariations(variations) {
    let sp = Module.stackSave(), vars = Module.stackAlloc(8 * variations.length);
    variations.forEach((variation, i) => {
      variation.writeTo(vars + i * 8);
    }), exports.hb_font_set_variations(this.ptr, vars, variations.length), Module.stackRestore(sp);
  }
  /** Set the font's font functions. */
  setFuncs(fontFuncs) {
    exports.hb_font_set_funcs(this.ptr, fontFuncs.ptr);
  }
  /**
  * Fetches the optical bound of a glyph positioned at the margin of text.
  * The direction identifies which edge of the glyph to query.
  * @param lookupIndex Index of the feature lookup to query.
  * @param direction Edge of the glyph to query.
  * @param glyph A glyph id.
  * @returns Adjustment value. Negative values mean the glyph will stick out of the margin.
  */
  getLookupOpticalBound(lookupIndex, direction, glyph) {
    return exports.hb_ot_layout_lookup_get_optical_bound(this.ptr, lookupIndex, direction, glyph);
  }
  /**
  * Fetches a list of the caret positions defined for a ligature glyph in the
  * GDEF table of the font.
  *
  * Note that a ligature that is formed from n characters will have n-1
  * caret positions. The first character is not represented in the array,
  * since its caret position is the glyph position.
  *
  * The positions returned by this function are 'unshaped', and will have to
  * be fixed up for kerning that may be applied to the ligature glyph.
  *
  * @param direction The text direction to use.
  * @param glyph The glyph to query.
  * @returns An array of caret positions.
  */
  getLigatureCarets(direction, glyph) {
    let sp = Module.stackSave(), startOffset = 0, caretCount = 128, caretCountPtr = Module.stackAlloc(4), caretArrayPtr = Module.stackAlloc(512), carets = [];
    for (; caretCount == 128; ) {
      Module.HEAPU32[caretCountPtr / 4] = caretCount, exports.hb_ot_layout_get_ligature_carets(this.ptr, direction, glyph, startOffset, caretCountPtr, caretArrayPtr), caretCount = Module.HEAPU32[caretCountPtr / 4];
      let caretArray = Module.HEAP32.subarray(caretArrayPtr / 4, caretArrayPtr / 4 + caretCount);
      carets.push(...Array.from(caretArray)), startOffset += caretCount;
    }
    return Module.stackRestore(sp), carets;
  }
  /**
  * Fetches metrics value corresponding to `metricsTag` from the font.
  *
  * @param metricsTag {@link MetricsTag} of metrics value you like to fetch.
  * @returns The metrics value, or undefined if not found in the font.
  */
  getMetricPosition(metricsTag) {
    let sp = Module.stackSave(), positionPtr = Module.stackAlloc(4), position;
    return exports.hb_ot_metrics_get_position(this.ptr, metricsTag, positionPtr) && (position = Module.HEAP32[positionPtr / 4]), Module.stackRestore(sp), position;
  }
  /**
  * Fetches metrics value corresponding to `metricsTag` from the font, and
  * synthesizes a value if the value is missing in the font.
  *
  * @param metricsTag {@link MetricsTag} of metrics value you like to fetch.
  * @returns The metrics value.
  */
  getMetricPositionWithFallback(metricsTag) {
    let sp = Module.stackSave(), positionPtr = Module.stackAlloc(4);
    exports.hb_ot_metrics_get_position_with_fallback(this.ptr, metricsTag, positionPtr);
    let position = Module.HEAP32[positionPtr / 4];
    return Module.stackRestore(sp), position;
  }
  /**
  * Fetches metrics value corresponding to `metricsTag` from the font with the
  * current font variation settings applied.
  *
  * @param metricsTag {@link MetricsTag} of metrics value you like to fetch.
  * @returns The requested metric value.
  */
  getMetricVariation(metricsTag) {
    return exports.hb_ot_metrics_get_variation(this.ptr, metricsTag);
  }
  /**
  * Fetches horizontal metrics value corresponding to `metricsTag` from the
  * font with the current font variation settings applied.
  *
  * @param metricsTag {@link MetricsTag} of metrics value you like to fetch.
  * @returns The requested metric value.
  */
  getMetricXVariation(metricsTag) {
    return exports.hb_ot_metrics_get_x_variation(this.ptr, metricsTag);
  }
  /**
  * Fetches vertical metrics value corresponding to `metricsTag` from the font
  * with the current font variation settings applied.
  *
  * @param metricsTag {@link MetricsTag} of metrics value you like to fetch.
  * @returns The requested metric value.
  */
  getMetricYVariation(metricsTag) {
    return exports.hb_ot_metrics_get_y_variation(this.ptr, metricsTag);
  }
}, FontFuncs = class {
  constructor() {
    this.ptr = exports.hb_font_funcs_create(), track(this, exports.hb_font_funcs_destroy);
  }
  /**
  * Set the font's glyph extents function.
  * @param func The callback receives a Font and glyph ID. It should return
  * an object with xBearing, yBearing, width, and height, or undefined on failure.
  */
  setGlyphExtentsFunc(func) {
    let funcPtr = Module.addFunction((fontPtr, font_data, glyph, extentsPtr, user_data) => {
      let extents = func(new Font(fontPtr), glyph);
      return extents ? (Module.HEAP32[extentsPtr / 4] = extents.xBearing, Module.HEAP32[extentsPtr / 4 + 1] = extents.yBearing, Module.HEAP32[extentsPtr / 4 + 2] = extents.width, Module.HEAP32[extentsPtr / 4 + 3] = extents.height, 1) : 0;
    }, "ippipp");
    exports.hb_font_funcs_set_glyph_extents_func(this.ptr, funcPtr, 0, 0);
  }
  /**
  * Set the font's glyph from name function.
  * @param func The callback receives a Font and glyph name. It should return
  * the glyph ID, or undefined on failure.
  */
  setGlyphFromNameFunc(func) {
    let funcPtr = Module.addFunction((fontPtr, font_data, namePtr, len, glyphPtr, user_data) => {
      let glyph = func(new Font(fontPtr), utf8_ptr_to_string(namePtr, len));
      return glyph ? (Module.HEAPU32[glyphPtr / 4] = glyph, 1) : 0;
    }, "ipppipp");
    exports.hb_font_funcs_set_glyph_from_name_func(this.ptr, funcPtr, 0, 0);
  }
  /**
  * Set the font's glyph horizontal advance function.
  * @param func The callback receives a Font and glyph ID. It should return
  * the horizontal advance of the glyph.
  */
  setGlyphHAdvanceFunc(func) {
    let funcPtr = Module.addFunction((fontPtr, font_data, glyph, user_data) => func(new Font(fontPtr), glyph), "ippip");
    exports.hb_font_funcs_set_glyph_h_advance_func(this.ptr, funcPtr, 0, 0);
  }
  /**
  * Set the font's glyph vertical advance function.
  * @param func The callback receives a Font and glyph ID. It should return
  * the vertical advance of the glyph.
  */
  setGlyphVAdvanceFunc(func) {
    let funcPtr = Module.addFunction((fontPtr, font_data, glyph, user_data) => func(new Font(fontPtr), glyph), "ippip");
    exports.hb_font_funcs_set_glyph_v_advance_func(this.ptr, funcPtr, 0, 0);
  }
  /**
  * Set the font's glyph horizontal origin function.
  * @param func The callback receives a Font and glyph ID. It should return
  * the [x, y] horizontal origin of the glyph, or undefined on failure.
  */
  setGlyphHOriginFunc(func) {
    let funcPtr = Module.addFunction((fontPtr, font_data, glyph, xPtr, yPtr, user_data) => {
      let origin = func(new Font(fontPtr), glyph);
      return origin ? (Module.HEAP32[xPtr / 4] = origin[0], Module.HEAP32[yPtr / 4] = origin[1], 1) : 0;
    }, "ippippp");
    exports.hb_font_funcs_set_glyph_h_origin_func(this.ptr, funcPtr, 0, 0);
  }
  /**
  * Set the font's glyph vertical origin function.
  * @param func The callback receives a Font and glyph ID. It should return
  * the [x, y] vertical origin of the glyph, or undefined on failure.
  */
  setGlyphVOriginFunc(func) {
    let funcPtr = Module.addFunction((fontPtr, font_data, glyph, xPtr, yPtr, user_data) => {
      let origin = func(new Font(fontPtr), glyph);
      return origin ? (Module.HEAP32[xPtr / 4] = origin[0], Module.HEAP32[yPtr / 4] = origin[1], 1) : 0;
    }, "ippippp");
    exports.hb_font_funcs_set_glyph_v_origin_func(this.ptr, funcPtr, 0, 0);
  }
  /**
  * Set the font's glyph horizontal kerning function.
  * @param func The callback receives a Font, first glyph ID, and second glyph ID.
  * It should return the horizontal kerning of the glyphs.
  */
  setGlyphHKerningFunc(func) {
    let funcPtr = Module.addFunction((fontPtr, font_data, firstGlyph, secondGlyph, user_data) => func(new Font(fontPtr), firstGlyph, secondGlyph), "ippiip");
    exports.hb_font_funcs_set_glyph_h_kerning_func(this.ptr, funcPtr, 0, 0);
  }
  /**
  * Set the font's glyph name function.
  * @param func The callback receives a Font and glyph ID. It should return
  * the name of the glyph, or undefined on failure.
  */
  setGlyphNameFunc(func) {
    let utf8Encoder2 = new TextEncoder(), funcPtr = Module.addFunction((fontPtr, font_data, glyph, namePtr, size, user_data) => {
      let name = func(new Font(fontPtr), glyph);
      return name ? (utf8Encoder2.encodeInto(name, Module.HEAPU8.subarray(namePtr, namePtr + size)), 1) : 0;
    }, "ippipip");
    exports.hb_font_funcs_set_glyph_name_func(this.ptr, funcPtr, 0, 0);
  }
  /**
  * Set the font's nominal glyph function.
  * @param func The callback receives a Font and unicode code point. It should
  * return the nominal glyph of the unicode, or undefined on failure.
  */
  setNominalGlyphFunc(func) {
    let funcPtr = Module.addFunction((fontPtr, font_data, unicode, glyphPtr, user_data) => {
      let glyph = func(new Font(fontPtr), unicode);
      return glyph ? (Module.HEAPU32[glyphPtr / 4] = glyph, 1) : 0;
    }, "ippipp");
    exports.hb_font_funcs_set_nominal_glyph_func(this.ptr, funcPtr, 0, 0);
  }
  /**
  * Set the font's variation glyph function.
  * @param func The callback receives a Font, unicode code point, and variation
  * selector. It should return the variation glyph, or undefined on failure.
  */
  setVariationGlyphFunc(func) {
    let funcPtr = Module.addFunction((fontPtr, font_data, unicode, variationSelector, glyphPtr, user_data) => {
      let glyph = func(new Font(fontPtr), unicode, variationSelector);
      return glyph ? (Module.HEAPU32[glyphPtr / 4] = glyph, 1) : 0;
    }, "ippiipp");
    exports.hb_font_funcs_set_variation_glyph_func(this.ptr, funcPtr, 0, 0);
  }
  /**
  * Set the font's horizontal extents function.
  * @param func The callback receives a Font. It should return an object with
  * ascender, descender, and lineGap, or undefined on failure.
  */
  setFontHExtentsFunc(func) {
    let funcPtr = Module.addFunction((fontPtr, font_data, extentsPtr, user_data) => {
      let extents = func(new Font(fontPtr));
      return extents ? (Module.HEAP32[extentsPtr / 4] = extents.ascender, Module.HEAP32[extentsPtr / 4 + 1] = extents.descender, Module.HEAP32[extentsPtr / 4 + 2] = extents.lineGap, 1) : 0;
    }, "ipppp");
    exports.hb_font_funcs_set_font_h_extents_func(this.ptr, funcPtr, 0, 0);
  }
  /**
  * Set the font's vertical extents function.
  * @param func The callback receives a Font. It should return an object with
  * ascender, descender, and lineGap, or undefined on failure.
  */
  setFontVExtentsFunc(func) {
    let funcPtr = Module.addFunction((fontPtr, font_data, extentsPtr, user_data) => {
      let extents = func(new Font(fontPtr));
      return extents ? (Module.HEAP32[extentsPtr / 4] = extents.ascender, Module.HEAP32[extentsPtr / 4 + 1] = extents.descender, Module.HEAP32[extentsPtr / 4 + 2] = extents.lineGap, 1) : 0;
    }, "ipppp");
    exports.hb_font_funcs_set_font_v_extents_func(this.ptr, funcPtr, 0, 0);
  }
};
function decode_color_line(colorLinePtr) {
  let extend = exports.hb_color_line_get_extend(colorLinePtr), colorStops = [], sp = Module.stackSave(), countPtr = Module.stackAlloc(4), stopsPtr = Module.stackAlloc(1536), startOffset = 0, count = 128;
  for (; count === 128; ) {
    Module.HEAPU32[countPtr / 4] = count, exports.hb_color_line_get_color_stops(colorLinePtr, startOffset, countPtr, stopsPtr), count = Module.HEAPU32[countPtr / 4];
    for (let i = 0; i < count; i++) {
      let o = (stopsPtr + i * 12) / 4;
      colorStops.push({
        offset: Module.HEAPF32[o],
        isForeground: Module.HEAPU32[o + 1] !== 0,
        color: color_from_int(Module.HEAPU32[o + 2])
      });
    }
    startOffset += count;
  }
  return Module.stackRestore(sp), {
    extend,
    colorStops
  };
}
var PaintFuncs = class {
  constructor() {
    this.funcPtrs = [], this.userDataPtrs = [], this.ptr = exports.hb_paint_funcs_create();
    let ptr = this.ptr, funcPtrs = this.funcPtrs, userDataPtrs = this.userDataPtrs;
    registry.register(this, () => {
      exports.hb_paint_funcs_destroy(ptr);
      for (let ptr2 of funcPtrs) Module.removeFunction(ptr2);
      for (let ptr2 of userDataPtrs) remove_callback_data_pointer(ptr2);
    });
  }
  /**
  * Sets the push-transform callback on the paint functions object.
  * @param func The push-transform callback.
  * @param userData Data to pass to `func`.
  */
  setPushTransformFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((funcs, paintData, xx, yx, xy, yy, dx, dy, user) => func(xx, yx, xy, yy, dx, dy, get_callback_data(paintData), get_callback_data(user)), "viiffffffi");
    this.funcPtrs.push(funcPtr), exports.hb_paint_funcs_set_push_transform_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets the pop-transform callback on the paint functions object.
  * @param func The pop-transform callback.
  * @param userData Data to pass to `func`.
  */
  setPopTransformFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((funcs, paintData, user) => func(get_callback_data(paintData), get_callback_data(user)), "viii");
    this.funcPtrs.push(funcPtr), exports.hb_paint_funcs_set_pop_transform_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets the color-glyph callback on the paint functions object.
  * @param func The color-glyph callback.
  * @param userData Data to pass to `func`.
  */
  setColorGlyphFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((funcs, paintData, glyph, fontPtr, user) => func(glyph, new Font(fontPtr), get_callback_data(paintData), get_callback_data(user)) ? 1 : 0, "iiiiii");
    this.funcPtrs.push(funcPtr), exports.hb_paint_funcs_set_color_glyph_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets the push-clip-glyph callback on the paint functions object.
  * @param func The push-clip-glyph callback.
  * @param userData Data to pass to `func`.
  */
  setPushClipGlyphFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((funcs, paintData, glyph, fontPtr, user) => func(glyph, new Font(fontPtr), get_callback_data(paintData), get_callback_data(user)), "viiiii");
    this.funcPtrs.push(funcPtr), exports.hb_paint_funcs_set_push_clip_glyph_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets the push-clip-rectangle callback on the paint functions object.
  * @param func The push-clip-rectangle callback.
  * @param userData Data to pass to `func`.
  */
  setPushClipRectangleFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((funcs, paintData, xmin, ymin, xmax, ymax, user) => func(xmin, ymin, xmax, ymax, get_callback_data(paintData), get_callback_data(user)), "viiffffi");
    this.funcPtrs.push(funcPtr), exports.hb_paint_funcs_set_push_clip_rectangle_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets the pop-clip callback on the paint functions object.
  * @param func The pop-clip callback.
  * @param userData Data to pass to `func`.
  */
  setPopClipFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((funcs, paintData, user) => func(get_callback_data(paintData), get_callback_data(user)), "viii");
    this.funcPtrs.push(funcPtr), exports.hb_paint_funcs_set_pop_clip_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets the paint-color callback on the paint functions object.
  * @param func The paint-color callback.
  * @param userData Data to pass to `func`.
  */
  setColorFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((funcs, paintData, isForeground, color, user) => func(isForeground !== 0, color_from_int(color), get_callback_data(paintData), get_callback_data(user)), "viiiii");
    this.funcPtrs.push(funcPtr), exports.hb_paint_funcs_set_color_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets the paint-image callback on the paint functions object.
  * @param func The paint-image callback.
  * @param userData Data to pass to `func`.
  */
  setImageFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((funcs, paintData, blob, width, height, format, slant, extentsPtr, user) => {
      let length = exports.hb_blob_get_length(blob), dataPtr = exports.hb_blob_get_data(blob, 0), image = Module.HEAPU8.subarray(dataPtr, dataPtr + length), extents;
      return extentsPtr && (extents = {
        xBearing: Module.HEAP32[extentsPtr / 4],
        yBearing: Module.HEAP32[extentsPtr / 4 + 1],
        width: Module.HEAP32[extentsPtr / 4 + 2],
        height: Module.HEAP32[extentsPtr / 4 + 3]
      }), func(image, width, height, hb_untag(format), extents, get_callback_data(paintData), get_callback_data(user)) ? 1 : 0;
    }, "iiiiiiifii");
    this.funcPtrs.push(funcPtr), exports.hb_paint_funcs_set_image_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets the linear-gradient callback on the paint functions object.
  * @param func The linear-gradient callback.
  * @param userData Data to pass to `func`.
  */
  setLinearGradientFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((funcs, paintData, colorLine, x0, y0, x1, y1, x2, y2, user) => func(decode_color_line(colorLine), x0, y0, x1, y1, x2, y2, get_callback_data(paintData), get_callback_data(user)), "viiiffffffi");
    this.funcPtrs.push(funcPtr), exports.hb_paint_funcs_set_linear_gradient_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets the radial-gradient callback on the paint functions object.
  * @param func The radial-gradient callback.
  * @param userData Data to pass to `func`.
  */
  setRadialGradientFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((funcs, paintData, colorLine, x0, y0, r0, x1, y1, r1, user) => func(decode_color_line(colorLine), x0, y0, r0, x1, y1, r1, get_callback_data(paintData), get_callback_data(user)), "viiiffffffi");
    this.funcPtrs.push(funcPtr), exports.hb_paint_funcs_set_radial_gradient_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets the sweep-gradient callback on the paint functions object.
  * @param func The sweep-gradient callback.
  * @param userData Data to pass to `func`.
  */
  setSweepGradientFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((funcs, paintData, colorLine, x0, y0, startAngle, endAngle, user) => func(decode_color_line(colorLine), x0, y0, startAngle, endAngle, get_callback_data(paintData), get_callback_data(user)), "viiiffffi");
    this.funcPtrs.push(funcPtr), exports.hb_paint_funcs_set_sweep_gradient_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets the push-group callback on the paint functions object.
  * @param func The push-group callback.
  * @param userData Data to pass to `func`.
  */
  setPushGroupFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((funcs, paintData, user) => func(get_callback_data(paintData), get_callback_data(user)), "viii");
    this.funcPtrs.push(funcPtr), exports.hb_paint_funcs_set_push_group_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets the pop-group callback on the paint functions object.
  * @param func The pop-group callback.
  * @param userData Data to pass to `func`.
  */
  setPopGroupFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((funcs, paintData, mode, user) => func(mode, get_callback_data(paintData), get_callback_data(user)), "viiii");
    this.funcPtrs.push(funcPtr), exports.hb_paint_funcs_set_pop_group_func(this.ptr, funcPtr, userDataPtr, 0);
  }
  /**
  * Sets the custom-palette-color callback on the paint functions object.
  * @param func The custom-palette-color callback.
  * @param userData Data to pass to `func`.
  */
  setCustomPaletteColorFunc(func, userData) {
    let userDataPtr = register_callback_data_pointer(userData);
    this.userDataPtrs.push(userDataPtr);
    let funcPtr = Module.addFunction((funcs, paintData, colorIndex, colorPtr, user) => {
      let color = func(colorIndex, get_callback_data(paintData), get_callback_data(user));
      return color !== void 0 ? (Module.HEAPU32[colorPtr / 4] = color_to_int(color), 1) : 0;
    }, "iiiiii");
    this.funcPtrs.push(funcPtr), exports.hb_paint_funcs_set_custom_palette_color_func(this.ptr, funcPtr, userDataPtr, 0);
  }
}, BufferContentType = {
  INVALID: 0,
  UNICODE: 1,
  GLYPHS: 2
}, BufferSerializeFlag = {
  DEFAULT: 0,
  NO_CLUSTERS: 1,
  NO_POSITIONS: 2,
  NO_GLYPH_NAMES: 4,
  GLYPH_EXTENTS: 8,
  GLYPH_FLAGS: 16,
  NO_ADVANCES: 32,
  DEFINED: 63
}, BufferFlag = {
  DEFAULT: 0,
  BOT: 1,
  EOT: 2,
  PRESERVE_DEFAULT_IGNORABLES: 4,
  REMOVE_DEFAULT_IGNORABLES: 8,
  DO_NOT_INSERT_DOTTED_CIRCLE: 16,
  VERIFY: 32,
  PRODUCE_UNSAFE_TO_CONCAT: 64,
  PRODUCE_SAFE_TO_INSERT_TATWEEL: 128,
  DEFINED: 255
}, Direction = {
  INVALID: 0,
  LTR: 4,
  RTL: 5,
  TTB: 6,
  BTT: 7
}, ClusterLevel = {
  MONOTONE_GRAPHEMES: 0,
  MONOTONE_CHARACTERS: 1,
  CHARACTERS: 2,
  GRAPHEMES: 3,
  DEFAULT: 0
}, BufferSerializeFormat = {
  INVALID: 0,
  TEXT: hb_tag("TEXT"),
  JSON: hb_tag("JSON")
}, Buffer = class Buffer2 {
  /**
  * @param existingPtr @internal Wrap an existing buffer pointer.
  */
  constructor(existingPtr) {
    existingPtr != null ? this.ptr = exports.hb_buffer_reference(existingPtr) : this.ptr = exports.hb_buffer_create(), track(this, exports.hb_buffer_destroy);
  }
  /**
  * Appends a character with the Unicode value of `codePoint` to the buffer,
  * and gives it the initial cluster value of `cluster`. Clusters can be any
  * thing the client wants, they are usually used to refer to the index of the
  * character in the input text stream and are output in the `cluster` field
  * of {@link GlyphInfo}.
  *
  * This function does not check the validity of `codePoint`, it is up to the
  * caller to ensure it is a valid Unicode code point.
  * @param codePoint A Unicode code point.
  * @param cluster The cluster value of `codePoint`.
  */
  add(codePoint, cluster) {
    exports.hb_buffer_add(this.ptr, codePoint, cluster);
  }
  /**
  * Add text to the buffer.
  * @param text Text to be added to the buffer.
  * @param itemOffset The offset of the first character to add to the buffer.
  * @param itemLength The number of characters to add to the buffer, or omit for the end of text.
  */
  addText(text, itemOffset = 0, itemLength) {
    let str = string_to_utf16_ptr(text);
    exports.hb_buffer_add_utf16(this.ptr, str.ptr, str.length, itemOffset, itemLength ?? str.length), str.free();
  }
  /**
  * Add code points to the buffer.
  * @param codePoints Array of code points to be added to the buffer.
  * @param itemOffset The offset of the first code point to add to the buffer.
  * @param itemLength The number of code points to add to the buffer, or omit for the end of the array.
  */
  addCodePoints(codePoints, itemOffset = 0, itemLength) {
    let codePointsPtr = exports.malloc(codePoints.length * 4);
    Module.HEAPU32.subarray(codePointsPtr / 4, codePointsPtr / 4 + codePoints.length).set(codePoints), exports.hb_buffer_add_codepoints(this.ptr, codePointsPtr, codePoints.length, itemOffset, itemLength ?? codePoints.length), exports.free(codePointsPtr);
  }
  /**
  * Set buffer script, language and direction.
  *
  * This needs to be done before shaping.
  */
  guessSegmentProperties() {
    exports.hb_buffer_guess_segment_properties(this.ptr);
  }
  /**
  * Set buffer direction explicitly.
  * @param dir A {@link Direction} value.
  */
  setDirection(dir) {
    exports.hb_buffer_set_direction(this.ptr, dir);
  }
  /**
  * Set buffer flags explicitly.
  * @param flags A combination of {@link BufferFlag} values (OR them together).
  */
  setFlags(flags) {
    exports.hb_buffer_set_flags(this.ptr, flags);
  }
  /**
  * Set buffer language explicitly.
  * @param language The buffer language
  */
  setLanguage(language) {
    let str = string_to_ascii_ptr(language);
    exports.hb_buffer_set_language(this.ptr, exports.hb_language_from_string(str.ptr, -1)), str.free();
  }
  /**
  * Set buffer script explicitly.
  * @param script The buffer script
  */
  setScript(script) {
    let str = string_to_ascii_ptr(script);
    exports.hb_buffer_set_script(this.ptr, exports.hb_script_from_string(str.ptr, -1)), str.free();
  }
  /**
  * Set the HarfBuzz clustering level.
  *
  * Affects the cluster values returned from shaping.
  * @param level A {@link ClusterLevel} value. See the HarfBuzz manual chapter on Clusters.
  */
  setClusterLevel(level) {
    exports.hb_buffer_set_cluster_level(this.ptr, level);
  }
  /** Reset the buffer to its initial status. */
  reset() {
    exports.hb_buffer_reset(this.ptr);
  }
  /**
  * Similar to reset(), but does not clear the Unicode functions and the
  * replacement code point.
  */
  clearContents() {
    exports.hb_buffer_clear_contents(this.ptr);
  }
  /**
  * Set message func.
  * @param func The function to set. It receives the buffer, font, and message
  * string as arguments. Returning false will skip this shaping step and move
  * to the next one.
  */
  setMessageFunc(func) {
    let traceFunc = (bufferPtr, fontPtr, messagePtr, user_data) => {
      let message = utf8_ptr_to_string(messagePtr);
      return func(new Buffer2(bufferPtr), new Font(fontPtr), message) ? 1 : 0;
    }, traceFuncPtr = Module.addFunction(traceFunc, "iiiii");
    exports.hb_buffer_set_message_func(this.ptr, traceFuncPtr, 0, 0);
  }
  /**
  * Get the the number of items in the buffer.
  * @returns The buffer length.
  */
  getLength() {
    return exports.hb_buffer_get_length(this.ptr);
  }
  /**
  * Get the glyph information from the buffer.
  * @returns An array of {@link GlyphInfo} objects.
  */
  getGlyphInfos() {
    let infosPtr = exports.hb_buffer_get_glyph_infos(this.ptr, 0), infosArray = Module.HEAPU32.subarray(infosPtr / 4, infosPtr / 4 + this.getLength() * 5), infos = [];
    for (let i = 0; i < infosArray.length; i += 5) infos.push({
      codepoint: infosArray[i],
      cluster: infosArray[i + 2],
      flags: exports.hb_glyph_info_get_glyph_flags(infosPtr + i * 4)
    });
    return infos;
  }
  /**
  * Get the glyph positions from the buffer.
  * @returns An array of {@link GlyphPosition} objects.
  */
  getGlyphPositions() {
    let positionsPtr32 = exports.hb_buffer_get_glyph_positions(this.ptr, 0) / 4;
    if (positionsPtr32 == 0) return [];
    let positionsArray = Module.HEAP32.subarray(positionsPtr32, positionsPtr32 + this.getLength() * 5), positions = [];
    for (let i = 0; i < positionsArray.length; i += 5) positions.push({
      xAdvance: positionsArray[i],
      yAdvance: positionsArray[i + 1],
      xOffset: positionsArray[i + 2],
      yOffset: positionsArray[i + 3]
    });
    return positions;
  }
  /**
  * Get the glyph information and positions from the buffer.
  * @returns The glyph information and positions.
  *
  * The glyph information is returned as an array of objects with the
  * properties from getGlyphInfos and getGlyphPositions combined.
  */
  getGlyphInfosAndPositions() {
    let infosPtr = exports.hb_buffer_get_glyph_infos(this.ptr, 0), infosArray = Module.HEAPU32.subarray(infosPtr / 4, infosPtr / 4 + this.getLength() * 5), positionsPtr32 = exports.hb_buffer_get_glyph_positions(this.ptr, 0) / 4, positionsArray = positionsPtr32 ? Module.HEAP32.subarray(positionsPtr32, positionsPtr32 + this.getLength() * 5) : void 0, out = [];
    for (let i = 0; i < infosArray.length; i += 5) {
      let info = {
        codepoint: infosArray[i],
        cluster: infosArray[i + 2],
        flags: exports.hb_glyph_info_get_glyph_flags(infosPtr + i * 4)
      };
      for (let [name, idx] of [
        ["mask", 1],
        ["var1", 3],
        ["var2", 4]
      ]) Object.defineProperty(info, name, {
        value: infosArray[i + idx],
        enumerable: !1
      });
      positionsArray && (info.xAdvance = positionsArray[i], info.yAdvance = positionsArray[i + 1], info.xOffset = positionsArray[i + 2], info.yOffset = positionsArray[i + 3], Object.defineProperty(info, "var", {
        value: positionsArray[i + 4],
        enumerable: !1
      })), out.push(info);
    }
    return out;
  }
  /**
  * Update the glyph positions in the buffer.
  * WARNING: Do not use unless you know what you are doing.
  */
  updateGlyphPositions(positions) {
    let positionsPtr32 = exports.hb_buffer_get_glyph_positions(this.ptr, 0) / 4;
    if (positionsPtr32 == 0) return;
    let len = Math.min(positions.length, this.getLength()), positionsArray = Module.HEAP32.subarray(positionsPtr32, positionsPtr32 + len * 5);
    for (let i = 0; i < len; i++)
      positionsArray[i * 5] = positions[i].xAdvance, positionsArray[i * 5 + 1] = positions[i].yAdvance, positionsArray[i * 5 + 2] = positions[i].xOffset, positionsArray[i * 5 + 3] = positions[i].yOffset;
  }
  /**
  * Serialize the buffer contents to a string.
  * @param options Serialization options:
  *  - `font`: the font to use for serialization;
  *  - `start`: the starting index of the glyphs (default `0`);
  *  - `end`: the ending index of the glyphs (default end of buffer);
  *  - `format`: a {@link BufferSerializeFormat} value (default `TEXT`);
  *  - `flags`: a combination of {@link BufferSerializeFlag} values (default `0`).
  * @returns The serialized buffer contents.
  */
  serialize(options = {}) {
    let { font, start = 0, end, format = BufferSerializeFormat.TEXT, flags = 0 } = options, sp = Module.stackSave(), endPos = end ?? this.getLength(), bufLen = 32 * 1024, bufPtr = exports.malloc(bufLen), bufConsumedPtr = Module.stackAlloc(4), result = "";
    for (; start < endPos; ) {
      start += exports.hb_buffer_serialize(this.ptr, start, endPos, bufPtr, bufLen, bufConsumedPtr, font ? font.ptr : 0, format, flags);
      let bufConsumed = Module.HEAPU32[bufConsumedPtr / 4];
      if (bufConsumed == 0) break;
      result += utf8_ptr_to_string(bufPtr, bufConsumed);
    }
    return exports.free(bufPtr), Module.stackRestore(sp), result;
  }
  /**
  * Return the buffer content type.
  *
  * @returns The buffer content type as a {@link BufferContentType} value.
  */
  getContentType() {
    return exports.hb_buffer_get_content_type(this.ptr);
  }
}, Feature = class Feature2 {
  static {
    this.GLOBAL_START = 0;
  }
  static {
    this.GLOBAL_END = 4294967295;
  }
  constructor(tag, value = 1, start = Feature2.GLOBAL_START, end = Feature2.GLOBAL_END) {
    this.tag = tag, this.value = value, this.start = start, this.end = end;
  }
  /**
  * Parses a string into a Feature.
  *
  * The format for specifying feature strings follows. All valid CSS
  * font-feature-settings values other than `normal` and the global values are
  * also accepted, though not documented below. CSS string escapes are not
  * supported.
  *
  * The range indices refer to the positions between Unicode characters. The
  * position before the first character is always 0.
  *
  * The format is Python-esque. Here is how it all works:
  *
  * | Syntax        | Value | Start | End | Meaning                          |
  * | ------------- | ----- | ----- | --- | -------------------------------- |
  * | `kern`        | 1     | 0     | ∞   | Turn feature on                  |
  * | `+kern`       | 1     | 0     | ∞   | Turn feature on                  |
  * | `-kern`       | 0     | 0     | ∞   | Turn feature off                 |
  * | `kern=0`      | 0     | 0     | ∞   | Turn feature off                 |
  * | `kern=1`      | 1     | 0     | ∞   | Turn feature on                  |
  * | `aalt=2`      | 2     | 0     | ∞   | Choose 2nd alternate             |
  * | `kern[]`      | 1     | 0     | ∞   | Turn feature on                  |
  * | `kern[:]`     | 1     | 0     | ∞   | Turn feature on                  |
  * | `kern[5:]`    | 1     | 5     | ∞   | Turn feature on, partial         |
  * | `kern[:5]`    | 1     | 0     | 5   | Turn feature on, partial         |
  * | `kern[3:5]`   | 1     | 3     | 5   | Turn feature on, range           |
  * | `kern[3]`     | 1     | 3     | 3+1 | Turn feature on, single char     |
  * | `aalt[3:5]=2` | 2     | 3     | 5   | Turn 2nd alternate on for range  |
  *
  * @param str The string to parse.
  * @returns A Feature, or undefined if the string is not a valid feature.
  */
  static fromString(str) {
    let sp = Module.stackSave(), featurePtr = Module.stackAlloc(16), strPtr = string_to_ascii_ptr(str), feature;
    return exports.hb_feature_from_string(strPtr.ptr, -1, featurePtr) && (feature = new Feature2(hb_untag(Module.HEAPU32[featurePtr / 4]), Module.HEAPU32[featurePtr / 4 + 1], Module.HEAPU32[featurePtr / 4 + 2], Module.HEAPU32[featurePtr / 4 + 3])), strPtr.free(), Module.stackRestore(sp), feature;
  }
  /**
  * Converts the feature to a string in the format understood by
  * {@link Feature.fromString}.
  *
  * Note that the feature value will be omitted if it is `1`, but the string
  * won't include any whitespace.
  *
  * @returns The feature string.
  */
  toString() {
    let sp = Module.stackSave(), featurePtr = Module.stackAlloc(16);
    this.writeTo(featurePtr);
    let bufLen = 128, bufPtr = Module.stackAlloc(bufLen);
    exports.hb_feature_to_string(featurePtr, bufPtr, bufLen);
    let result = utf8_ptr_to_string(bufPtr);
    return Module.stackRestore(sp), result;
  }
  /** @internal Write this feature into the given hb_feature_t pointer. */
  writeTo(ptr) {
    Module.HEAPU32[ptr / 4] = hb_tag(this.tag), Module.HEAPU32[ptr / 4 + 1] = this.value, Module.HEAPU32[ptr / 4 + 2] = this.start, Module.HEAPU32[ptr / 4 + 3] = this.end;
  }
}, Variation = class Variation2 {
  constructor(tag, value = 0) {
    this.tag = tag, this.value = value;
  }
  /**
  * Parses a string into a Variation.
  *
  * The format for specifying variation settings follows. All valid CSS
  * font-variation-settings values other than `normal` and `inherited` are
  * also accepted, though, not documented below.
  *
  * The format is a tag, optionally followed by an equals sign, followed by a
  * number. For example `wght=500`, or `slnt=-7.5`.
  *
  * @param str The string to parse.
  * @returns A Variation, or undefined if the string is not a valid variation.
  */
  static fromString(str) {
    let sp = Module.stackSave(), variationPtr = Module.stackAlloc(8), strPtr = string_to_ascii_ptr(str), variation;
    return exports.hb_variation_from_string(strPtr.ptr, -1, variationPtr) && (variation = new Variation2(hb_untag(Module.HEAPU32[variationPtr / 4]), Module.HEAPF32[variationPtr / 4 + 1])), strPtr.free(), Module.stackRestore(sp), variation;
  }
  /**
  * Converts the variation to a string in the format understood by
  * {@link Variation.fromString}.
  *
  * Note that the string won't include any whitespace.
  *
  * @returns The variation string.
  */
  toString() {
    let sp = Module.stackSave(), variationPtr = Module.stackAlloc(8);
    this.writeTo(variationPtr);
    let bufLen = 128, bufPtr = Module.stackAlloc(bufLen);
    exports.hb_variation_to_string(variationPtr, bufPtr, bufLen);
    let result = utf8_ptr_to_string(bufPtr);
    return Module.stackRestore(sp), result;
  }
  /** @internal Write this variation into the given hb_variation_t pointer. */
  writeTo(ptr) {
    Module.HEAPU32[ptr / 4] = hb_tag(this.tag), Module.HEAPF32[ptr / 4 + 1] = this.value;
  }
}, TracePhase = {
  DONT_STOP: 0,
  GSUB: 1,
  GPOS: 2
};
function shape(font, buffer, features) {
  let featuresLen = features?.length ?? 0, sp = Module.stackSave(), featuresPtr = 0;
  featuresLen && (featuresPtr = Module.stackAlloc(16 * featuresLen), features.forEach((feature, i) => {
    feature.writeTo(featuresPtr + i * 16);
  })), exports.hb_shape(font.ptr, buffer.ptr, featuresPtr, featuresLen), Module.stackRestore(sp);
}
function shapeWithTrace(font, buffer, features, stop_at, stop_phase) {
  let trace = [], currentPhase = TracePhase.DONT_STOP, stopping = !1;
  return buffer.setMessageFunc((buffer2, font2, message) => {
    if (message.startsWith("start table GSUB") ? currentPhase = TracePhase.GSUB : message.startsWith("start table GPOS") && (currentPhase = TracePhase.GPOS), currentPhase != stop_phase && (stopping = !1), stop_phase != TracePhase.DONT_STOP && currentPhase == stop_phase && message.startsWith("end lookup " + stop_at) && (stopping = !0), stopping) return !1;
    let traceBuf = buffer2.serialize({
      font: font2,
      format: BufferSerializeFormat.JSON,
      flags: BufferSerializeFlag.NO_GLYPH_NAMES
    });
    return trace.push({
      m: message,
      t: JSON.parse(traceBuf),
      glyphs: buffer2.getContentType() == BufferContentType.GLYPHS
    }), !0;
  }), shape(font, buffer, features), trace;
}
function version() {
  let sp = Module.stackSave(), versionPtr = Module.stackAlloc(12);
  exports.hb_version(versionPtr, versionPtr + 4, versionPtr + 8);
  let ver = {
    major: Module.HEAPU32[versionPtr / 4],
    minor: Module.HEAPU32[(versionPtr + 4) / 4],
    micro: Module.HEAPU32[(versionPtr + 8) / 4]
  };
  return Module.stackRestore(sp), ver;
}
function versionString() {
  return utf8_ptr_to_string(exports.hb_version_string());
}
function otTagToScript(tag) {
  let hbTag = hb_tag(tag);
  return hb_untag(exports.hb_ot_tag_to_script(hbTag));
}
function otTagToLanguage(tag) {
  let hbTag = hb_tag(tag);
  return language_to_string(exports.hb_ot_tag_to_language(hbTag));
}
init(await harfbuzz_default());
export {
  AxisFlags,
  Blob,
  Buffer,
  BufferContentType,
  BufferFlag,
  BufferSerializeFlag,
  BufferSerializeFormat,
  ClusterLevel,
  ColorPaletteFlags,
  Direction,
  DrawFuncs,
  Face,
  Feature,
  Font,
  FontFuncs,
  GlyphClass,
  GlyphFlag,
  MetricsTag,
  PaintCompositeMode,
  PaintExtend,
  PaintFuncs,
  TracePhase,
  Variation,
  otTagToLanguage,
  otTagToScript,
  shape,
  shapeWithTrace,
  version,
  versionString
};
