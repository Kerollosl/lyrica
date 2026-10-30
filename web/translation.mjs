import {
  models,
  languageCode,
  supportsModel,
  modelIsCached,
  MODEL_CACHE,
  RUNTIME_CACHE,
} from "./translation-models.mjs";
export { models } from "./translation-models.mjs";

let worker, workerSource;
function releaseWorker() {
  worker?.terminate();
  worker = undefined;
  workerSource = undefined;
}
export async function clearTranslationModels() {
  releaseWorker();
  if (globalThis.caches)
    await Promise.all([
      caches.delete(MODEL_CACHE),
      caches.delete(RUNTIME_CACHE),
    ]);
}
export async function detectLanguage(text) {
  if (!globalThis.LanguageDetector) return null;
  try {
    if ((await LanguageDetector.availability()) !== "available") return null;
    const detector = await LanguageDetector.create();
    try {
      const [result] = await detector.detect(text);
      return result?.confidence >= 0.5 ? result.detectedLanguage : null;
    } finally {
      detector.destroy();
    }
  } catch {
    return null;
  }
}
export async function translationStatus(source, target) {
  if (!source) return "source-needed";
  if (languageCode(source) === languageCode(target)) return "same";
  const code = languageCode(source);
  if (
    supportsModel(source, target) &&
    (workerSource === code || (await modelIsCached(code)))
  )
    return "model-ready";
  if (globalThis.Translator) {
    try {
      const available = await Translator.availability({
        sourceLanguage: source,
        targetLanguage: target,
      });
      if (available !== "unavailable") return available;
    } catch {
      /* A local model may still support this language pair. */
    }
  }
  if (
    !supportsModel(source, target) ||
    !globalThis.Worker ||
    !globalThis.WebAssembly
  )
    return "unavailable";
  return "model-download";
}

export function translateWithModel(
  text,
  source,
  { signal, progress = () => {}, onLine = () => {} },
) {
  signal.throwIfAborted();
  source = languageCode(source);
  if (!models[source])
    return Promise.reject(
      new Error(
        "Automatic mobile translation supports Spanish, Arabic, and French to English.",
      ),
    );
  if (workerSource !== source) releaseWorker();
  if (!worker) {
    worker = new Worker(new URL("./translation-worker.mjs", import.meta.url), {
      type: "module",
    });
    workerSource = source;
  }
  const current = worker;
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      current.onmessage = null;
      current.onerror = null;
      current.onmessageerror = null;
    };
    const fail = (error) => {
      cleanup();
      releaseWorker();
      reject(error);
    };
    const abort = () =>
      fail(
        signal.reason ||
          new DOMException("Translation cancelled", "AbortError"),
      );
    const watch = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          fail(
            new Error(
              "Translation took too long. Check your connection, then retry with a shorter excerpt.",
            ),
          ),
        180000,
      );
    };
    signal.addEventListener("abort", abort, { once: true });
    current.onerror = () =>
      fail(
        new Error(
          "This browser couldn’t run the translation model. Try opening Lyrica directly in Safari or Chrome, or paste a translation.",
        ),
      );
    current.onmessageerror = () =>
      fail(
        new Error("The translation worker stopped responding. Please retry."),
      );
    current.onmessage = ({ data }) => {
      watch();
      if (data.type === "progress") progress(data.message);
      if (data.type === "line") {
        onLine(data.index, data.text);
        progress(
          `Translating on your device · ${Math.round(((data.index + 1) / data.total) * 100)}%`,
        );
      }
      if (data.type === "complete") {
        cleanup();
        resolve(data.lines);
      }
      if (data.type === "error") fail(new Error(data.message));
    };
    watch();
    current.postMessage({ source, text });
  });
}

export async function translateLines(
  text,
  source,
  target,
  { signal, progress = () => {}, onLine = () => {}, engine = "native" },
) {
  if (engine === "model")
    return translateWithModel(text, source, { signal, progress, onLine });
  signal.throwIfAborted();
  const translator = await Translator.create({
    sourceLanguage: source,
    targetLanguage: target,
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) =>
        progress(
          `Downloading a free language model · ${Math.round(event.loaded * 100)}%`,
        ),
      );
    },
  });
  const abort = () => translator.destroy();
  signal.addEventListener("abort", abort, { once: true });
  try {
    const result = [],
      lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      signal.throwIfAborted();
      result.push(lines[i].trim() ? await translator.translate(lines[i]) : "");
      signal.throwIfAborted();
      onLine(i, result[i]);
      progress(
        `Translating on your device · ${Math.round(((i + 1) / lines.length) * 100)}%`,
      );
    }
    return result;
  } finally {
    signal.removeEventListener("abort", abort);
    translator.destroy();
  }
}
