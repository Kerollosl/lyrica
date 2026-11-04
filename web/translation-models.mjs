// Quantized OPUS-MT models. Pin revisions so downloads cannot silently change.
export const MODEL_CACHE = "lyrica-translation-models-v1";
export const RUNTIME_CACHE = "lyrica-translation-runtime-v1";
export const models = Object.freeze({
  es: {
    name: "Spanish",
    id: "Xenova/opus-mt-es-en",
    revision: "eadfd7c658a9d8929ac3b8e996b68a68e2c7d480",
  },
  ar: {
    name: "Arabic",
    id: "Xenova/opus-mt-ar-en",
    revision: "09c7556866400dcc53562ba8d7035119e7d9a2c1",
  },
  fr: {
    name: "French",
    id: "Xenova/opus-mt-fr-en",
    revision: "6b166a182780e118c997879d0ad5be4b53671644",
  },
});
export const languageCode = (value) =>
  String(value || "")
    .toLowerCase()
    .split(/[-_]/)[0];
export const supportsModel = (source, target) =>
  Boolean(models[languageCode(source)]) && languageCode(target) === "en";
export const markerURL = (source) =>
  new URL(
    `./__translation_models/${source}/${models[source].revision}`,
    import.meta.url,
  ).href;

export async function modelIsCached(source) {
  source = languageCode(source);
  if (!models[source] || !globalThis.caches) return false;
  try {
    const cache = await caches.open(MODEL_CACHE);
    const marker = await cache.match(markerURL(source));
    if (!marker) return false;
    const keys = await marker.json();
    if (!Array.isArray(keys) || keys.length < 2) return false;
    return (await Promise.all(keys.map((key) => cache.match(key)))).every(
      Boolean,
    );
  } catch {
    return false;
  }
}
