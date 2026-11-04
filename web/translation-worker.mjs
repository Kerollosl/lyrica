import { models, MODEL_CACHE, markerURL } from "./translation-models.mjs";

import { splitTranslationInput, translateUnits } from "./translation-text.mjs";

let translator;
self.onmessage = async ({ data: { source, text, style = "lines" } }) => {
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
    const tokenCount = (input) => translator.tokenizer.encode(input).length;
    const generate = async (input, budget = 400) => {
      const chunks = splitTranslationInput(input, tokenCount, budget, source);
      const output = [];
      for (const chunk of chunks) {
        // The convenience pipeline always enables truncation. Use explicit inputs
        // instead so long lyrics are never silently clipped at the encoder limit.
        const inputs = translator.tokenizer(chunk, {
          padding: true,
          truncation: false,
        });
        const tokens = await translator.model.generate({
          ...inputs,
          max_new_tokens: 448,
          do_sample: false,
        });
        if (tokens.dims[1] >= 449) {
          // Do not cache a translation cut off by the decoder limit.
          const smaller = Math.floor(tokenCount(chunk) / 2);
          if (smaller < 8 || smaller >= budget)
            throw new Error("The model could not finish this phrase.");
          output.push(await generate(chunk, smaller));
        } else {
          const translated = translator.tokenizer
            .batch_decode(tokens, { skip_special_tokens: true })[0]
            ?.trim();
          if (!translated)
            throw new Error("The model returned an empty phrase.");
          output.push(translated);
        }
      }
      return output.join(" ");
    };
    const total = text.split("\n").length;
    const result = await translateUnits(
      text,
      style,
      generate,
      (index, translated) => {
        self.postMessage({ type: "line", index, text: translated, total });
      },
    );
    self.postMessage({ type: "complete", lines: result });
  } catch {
    self.postMessage({
      type: "error",
      message:
        "The language model couldn’t load or finish. Check your connection and free storage, then retry. If this device runs out of memory, try a shorter excerpt or paste a translation.",
    });
  }
};
