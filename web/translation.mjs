export async function detectLanguage(text) {
  if (
    !globalThis.LanguageDetector ||
    (await LanguageDetector.availability()) !== "available"
  )
    return null;
  const detector = await LanguageDetector.create();
  try {
    const [result] = await detector.detect(text);
    return result?.confidence >= 0.5 ? result.detectedLanguage : null;
  } finally {
    detector.destroy();
  }
}
export async function translationStatus(source, target) {
  if (source && source === target) return "same";
  if (!globalThis.Translator) return "missing";
  if (!source) return "source-needed";
  return Translator.availability({
    sourceLanguage: source,
    targetLanguage: target,
  });
}
export async function translateLines(
  text,
  source,
  target,
  { signal, progress },
) {
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
  try {
    const result = [];
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      signal.throwIfAborted();
      result.push(lines[i] ? await translator.translate(lines[i]) : "");
      signal.throwIfAborted();
      progress(
        `Translating on your device · ${Math.round(((i + 1) / lines.length) * 100)}%`,
      );
    }
    return result;
  } finally {
    translator.destroy();
  }
}
