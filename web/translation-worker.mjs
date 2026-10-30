import {
  models,
  MODEL_CACHE,
  markerURL,
  translationChunks,
} from "./translation-models.mjs";

let translator;
self.onmessage = async ({ data: { source, text } }) => {
  try {
    const { pipeline, env } = await import(
      "./vendor/transformers/transformers.min.js"
    );
    env.allowLocalModels = false;
    env.useBrowserCache = false;
    env.backends.onnx.wasm.numThreads = 1; // Works without cross-origin isolation on iOS.
    env.backends.onnx.wasm.proxy = false; // Already off the UI thread.
    env.backends.onnx.wasm.wasmPaths = new URL(
      "./vendor/transformers/",
      import.meta.url,
    ).href;
    let cache;
    try {
      cache = await caches.open(MODEL_CACHE);
    } catch {
      /* Translation also works without persistent storage. */
    }
    const assetKeys = new Set();
    if (cache) {
      env.useCustomCache = true;
      env.customCache = {
        async match(key) {
          const response = await cache.match(key);
          if (response) assetKeys.add(String(key.url || key));
          return response;
        },
        async put(key, response) {
          // Track required downloads even if quota prevents caching one of them.
          // The ready marker must never claim a partial download is complete.
          assetKeys.add(String(key.url || key));
          try {
            await cache.put(key, response);
          } catch {
            /* Low storage must not prevent this session's translation. */
          }
        },
      };
    }
    if (!translator) {
      const files = new Map();
      translator = await pipeline("translation", models[source].id, {
        revision: models[source].revision,
        dtype: "q8",
        device: "wasm",
        progress_callback(event) {
          if (event.status === "progress" && event.total) {
            files.set(event.file, { loaded: event.loaded, total: event.total });
            let loaded = 0,
              total = 0;
            for (const file of files.values()) {
              loaded += file.loaded;
              total += file.total;
            }
            self.postMessage({
              type: "progress",
              message: `Loading ${models[source].name} → English · ${Math.round(loaded / 1e6)} MB loaded`,
            });
          }
        },
      });
      if (cache && assetKeys.size) {
        try {
          await cache.put(
            markerURL(source),
            new Response(JSON.stringify([...assetKeys])),
          );
        } catch {
          /* Optional cache. */
        }
      }
    }
    const lines = text.split("\n");
    const result = Array(lines.length).fill("");
    const repeated = new Map();
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (line.trim()) {
        if (!repeated.has(line)) {
          const translated = [];
          for (const chunk of translationChunks(line)) {
            const output = await translator(chunk, { max_new_tokens: 256 });
            if (!output?.[0]?.translation_text?.trim())
              throw new Error("The model returned an empty line.");
            translated.push(output[0].translation_text.trim());
          }
          repeated.set(line, translated.join(" "));
        }
        result[index] = repeated.get(line);
      }
      self.postMessage({
        type: "line",
        index,
        text: result[index],
        total: lines.length,
      });
    }
    self.postMessage({ type: "complete", lines: result });
  } catch {
    self.postMessage({
      type: "error",
      message:
        "The language model couldn’t load or finish. Check your connection and free storage, then retry. If this device runs out of memory, try a shorter excerpt or paste a translation.",
    });
  }
};
