# Web translation: Spanish, Arabic, and French to English

The website can run automatic translation locally without a translation server or per-request API fee. This does not use Apple Translation, which is exclusive to the native iOS app.

## Supported downloadable models

| Original → translation | Quantized model | Revision | Encoder + decoder bytes |
| --- | --- | --- | --- |
| Spanish → English | [Xenova/opus-mt-es-en](https://huggingface.co/Xenova/opus-mt-es-en) | `eadfd7c658a9d8929ac3b8e996b68a68e2c7d480` | 113,112,546 |
| Arabic → English | [Xenova/opus-mt-ar-en](https://huggingface.co/Xenova/opus-mt-ar-en) | `09c7556866400dcc53562ba8d7035119e7d9a2c1` | 110,884,870 |
| French → English | [Xenova/opus-mt-fr-en](https://huggingface.co/Xenova/opus-mt-fr-en) | `6b166a182780e118c997879d0ad5be4b53671644` | 107,471,910 |

Tokenizers/configuration add several MB. The shared vendored engine adds approximately 23 MB. These ONNX conversions identify their Helsinki-NLP OPUS-MT base models; the base model cards specify Apache-2.0. Runtime notices are in `web/vendor/transformers/`. Model licensing grants no rights to commercial song lyrics or their translations.

## Experience and privacy

1. Retrieve or paste permitted original lyrics and choose the source language if browser detection is unavailable.
2. Keep English as the translation language. A cached model is reused; otherwise a supported browser-native translator is preferred.
3. In browsers without native support, review the download notice and select **Download & translate**. Model downloads never start just from selecting a source or opening a song.
4. Read translated rows as they finish. Verse breaks, source indices, independent Arabic RTL direction, wrapping, and highlights are preserved. Repeated lines are translated once per operation. Long lines are chunked and rejoined in the same row.
5. Cancel to stop work. Changing source/navigating away cancels active work. Only complete translations enter the song cache, and persistent lyric/translation storage still requires the existing permission setting.

Model files are fetched from Hugging Face; no lyric text is included in those requests. Actual inference occurs inside a dedicated module Worker using single-threaded WASM. Only one model worker is retained. Cached models use `lyrica-translation-models-v1`; shared runtime files use `lyrica-translation-runtime-v1`. Model availability markers include the required cached asset keys, so a missing file invalidates the cached-ready status. Settings removes both caches without deleting saved translations.

Offline inference requires previously downloaded model assets and engine, the installed app shell, and retained browser storage. Cache eviction/private browsing/low storage can require a new download. No cloud translation fallback is silently used. Other pairs retain manual translation and supported browser-native translation.

## Verification

On 2026-10-30, real quantized models ran successfully in Linux Chromium with a 390 × 844 viewport:

- Spanish: `Hola mundo` → `Hello world`; `El sol brilla` → `The sun is shining`.
- Arabic: `مرحبا بالعالم` → `Welcome to the world.`; `صباح الخير` → `Good morning.`.
- French: `Bonjour le monde` → `Hello, world`; `Le soleil brille` → `The sun shines`.
- Each check retained a blank verse and reused a repeated line. All three model caches were marked available after successful initialization.
- French inference after a full reload with network disabled produced `The sky is blue` from `Le ciel est bleu`. Removing downloaded models made the cached-ready check false.

These are authored test phrases, not commercial lyrics. First initialization plus two unique short lines took approximately 6–10 seconds in this environment, including downloads. **This is not an iPhone benchmark or a promise of instant translation.** Full-song latency, Arabic dialect/poetry accuracy, Safari memory limits, embedded ChatGPT browser capabilities, VoiceOver, and real-device cache retention still require physical-device acceptance checks.

Run deterministic checks with `node --test tests/web/*.test.mjs` and `python3 tests/web/translation-browser.py`. To repeat actual inference, start the web server and run `python3 tests/web/models.py` (approximately 350 MB of model downloads). The optional real-model test is not run on every CI push.
