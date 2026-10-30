import test from "node:test";
import assert from "node:assert/strict";
import {
  modelIsCached,
  markerURL,
  supportsModel,
  translationChunks,
} from "../../web/translation-models.mjs";
import {
  translationStatus,
  translateWithModel,
  detectLanguage,
  clearTranslationModels,
} from "../../web/translation.mjs";

test("only the requested model pairs are downloadable, including regional language codes", () => {
  for (const source of ["es", "ar", "fr", "es-MX", "ar_EG", "fr-CA"])
    assert.ok(supportsModel(source, "en-US"));
  for (const [source, target] of [
    ["en", "es"],
    ["fr", "ar"],
    ["it", "en"],
    ["", "en"],
  ])
    assert.equal(supportsModel(source, target), false);
});
test("long multilingual rows are bounded without losing words or breaking Unicode", () => {
  for (const text of [
    "Bonjour ".repeat(300).trim(),
    "مرحبا ".repeat(300).trim(),
    "🎵".repeat(401),
  ]) {
    const chunks = translationChunks(text);
    assert.ok(chunks.every((c) => Array.from(c).length <= 200));
    assert.equal(chunks.join("").replace(/\s/g, ""), text.replace(/\s/g, ""));
  }
});
test("language detection failures leave the source for the user to choose", async () => {
  globalThis.LanguageDetector = {
    availability: async () => {
      throw Error("denied");
    },
  };
  assert.equal(await detectLanguage("Bonjour"), null);
  delete globalThis.LanguageDetector;
});

class FakeWorker {
  static instances = [];
  constructor() {
    this.terminated = false;
    FakeWorker.instances.push(this);
  }
  postMessage(message) {
    this.request = message;
  }
  terminate() {
    this.terminated = true;
  }
  send(data) {
    this.onmessage?.({ data });
  }
}
globalThis.Worker = FakeWorker;
test("status never starts downloads and unsupported pairs do not start workers", async () => {
  assert.equal(await translationStatus("es", "en"), "model-download");
  assert.equal(await translationStatus("fr", "en"), "model-download");
  assert.equal(await translationStatus("ar", "en"), "model-download");
  assert.equal(await translationStatus("it", "en"), "unavailable");
  assert.equal(await translationStatus("", "en"), "source-needed");
  assert.equal(await translationStatus("en-US", "en"), "same");
  assert.equal(FakeWorker.instances.length, 0);
});
test("native unsupported/error falls back only for the requested language pairs", async () => {
  globalThis.Translator = { availability: async () => "available" };
  assert.equal(await translationStatus("fr", "en"), "available");
  globalThis.Translator.availability = async () => {
    throw Error("model unavailable");
  };
  assert.equal(await translationStatus("fr", "en"), "model-download");
  assert.equal(await translationStatus("it", "en"), "unavailable");
  delete globalThis.Translator;
});
test("streams indexed rows and verse breaks; abort kills in-flight inference; errors allow retry", async () => {
  const controller = new AbortController(),
    streamed = [];
  const result = translateWithModel("Hola\n\nMundo", "es", {
    signal: controller.signal,
    onLine: (i, text) => streamed.push([i, text]),
  });
  const first = FakeWorker.instances.at(-1);
  first.send({ type: "line", index: 0, text: "Hello", total: 3 });
  first.send({ type: "line", index: 1, text: "", total: 3 });
  first.send({ type: "line", index: 2, text: "World", total: 3 });
  first.send({ type: "complete", lines: ["Hello", "", "World"] });
  assert.deepEqual(await result, ["Hello", "", "World"]);
  assert.deepEqual(streamed, [
    [0, "Hello"],
    [1, ""],
    [2, "World"],
  ]);
  controller.abort();
  assert.equal(
    first.terminated,
    false,
    "completed operations remove abort handlers",
  );
  const cancelling = new AbortController();
  const pending = translateWithModel("Hola", "es", {
    signal: cancelling.signal,
  });
  cancelling.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(first.terminated, true);
  const failing = translateWithModel("Bonjour", "fr", {
    signal: new AbortController().signal,
  });
  FakeWorker.instances
    .at(-1)
    .send({ type: "error", message: "Storage unavailable" });
  await assert.rejects(failing, /Storage unavailable/);
  assert.equal(FakeWorker.instances.at(-1).terminated, true);
  await clearTranslationModels();
});

test("cache readiness requires every recorded model asset", async () => {
  const assets = new Map([
    ["encoder", new Response("weights")],
    ["decoder", new Response("weights")],
  ]);
  globalThis.caches = {
    open: async () => ({
      match: async (key) =>
        key === markerURL("es")
          ? new Response(JSON.stringify(["encoder", "decoder"]))
          : assets.get(key),
    }),
  };
  try {
    assert.equal(await modelIsCached("es"), true);
    assets.delete("encoder");
    assert.equal(await modelIsCached("es"), false);
  } finally {
    delete globalThis.caches;
  }
});
