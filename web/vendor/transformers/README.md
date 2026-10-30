# Vendored browser inference runtime

Source: npm `@huggingface/transformers@3.8.1`, `dist/`.

- `transformers.min.js`: complete browser ESM bundle (not the `web.min.js` bundle, which needs bare dependency resolution). Only its missing sourcemap reference is removed.
- `ort-wasm-simd-threaded.jsep.mjs` and `.wasm`: matching ONNX Runtime Web 1.22.0-dev.20250409-89f8206ba4 runtime. Lyrica selects single-threaded WASM within a dedicated worker, requiring no cross-origin isolation or WebGPU.
- `LICENSE`: Transformers.js Apache-2.0 license.
- Additional files preserve the bundled ONNX Runtime and Jinja license notices.

These assets are served from Lyrica's origin and cached on demand, not during app-shell installation. Do not mix runtime binaries from another version. Model weights are not vendored; pinned model identifiers/revisions are in `translation-models.mjs`.
