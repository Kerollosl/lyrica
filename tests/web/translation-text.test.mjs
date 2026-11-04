import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTranslationInput,
  translationUnits,
  splitTranslationInput,
  translateUnits,
  translationKey,
} from "../../web/translation-text.mjs";

test("normalizes model punctuation while preserving original words, accents and Arabic vowels", () => {
  assert.equal(
    normalizeTranslationInput("J’ai\u00a0beau essayer,\n tu m’aimes."),
    "J'ai beau essayer, tu m'aimes.",
  );
  assert.equal(normalizeTranslationInput("قَـلبي\u200f جميل"), "قَلبي جميل");
});
test("context follows sentence and stanza boundaries and preserves source indices", () => {
  const text =
    "Quiero que sepas\nque puedes contar conmigo.\nNo te rindas.\n\n[Chorus]\nUna luz\nen el mar";
  const units = translationUnits(text);
  assert.deepEqual(
    units.map((u) => [u.start, u.end]),
    [
      [0, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 6],
    ],
  );
  assert.equal(units.map((u) => u.text).join("\n"), text);
  assert.equal(translationUnits(text, "lines").length, 7);
  assert.ok(
    translationUnits("canta\n".repeat(30)).every((u) => u.end - u.start < 6),
  );
});
test("token budget keeps short sentences intact and never silently drops overlong words", () => {
  const text = "First sentence. Second sentence. Third sentence.";
  const chunks = splitTranslationInput(text, (t) => t.length, 33);
  assert.deepEqual(chunks, [
    "First sentence. Second sentence.",
    "Third sentence.",
  ]);
  for (const text of [
    "mot ".repeat(1000).trim(),
    "مرحبا ".repeat(200).trim(),
    "🎵".repeat(401),
  ]) {
    const pieces = splitTranslationInput(text, (t) => Array.from(t).length, 30);
    assert.ok(pieces.every((p) => Array.from(p).length <= 30));
    assert.equal(pieces.join("").replace(/\s/g, ""), text.replace(/\s/g, ""));
  }
});
test("context output is anchored to the whole original phrase without invented English line boundaries", async () => {
  const streamed = [],
    calls = [];
  const result = await translateUnits(
    "Tu me manques\nplus que tu ne le sais.\n\nTu me manques\nplus que tu ne le sais.",
    "context",
    async (text) => {
      calls.push(text);
      return "I miss you more than you know.";
    },
    (i, text) => streamed.push([i, text]),
  );
  assert.deepEqual(result, [
    "I miss you more than you know.",
    "",
    "",
    "I miss you more than you know.",
    "",
  ]);
  assert.equal(calls.length, 1);
  assert.equal(streamed.length, 5);
});
test("identical isolated lines with different context do not reuse a phrase translation", async () => {
  const calls = [];
  await translateUnits(
    "Je le sais\nquand tu souris.\n\nJe le sais\nquand tu pars.",
    "context",
    async (input) => {
      calls.push(input);
      return input;
    },
    () => {},
  );
  assert.equal(calls.length, 2);
});
test("cancellation after inference prevents a phrase being streamed or cached", async () => {
  const controller = new AbortController(),
    seen = [];
  await assert.rejects(
    translateUnits(
      "Une phrase",
      "context",
      async () => {
        controller.abort();
        return "A phrase";
      },
      (i, t) => seen.push(t),
      () => controller.signal.throwIfAborted(),
    ),
    { name: "AbortError" },
  );
  assert.deepEqual(seen, []);
});
test("text cache separates quality revisions and translation styles from legacy and manual entries", () => {
  assert.notEqual(translationKey("fr", "en"), "fr:en");
  assert.notEqual(
    translationKey("fr", "en", "context"),
    translationKey("fr", "en", "lines"),
  );
});

test("empty provider output is rejected instead of being saved as a successful translation", async () => {
  await assert.rejects(
    translateUnits(
      "Une phrase",
      "context",
      async () => " ",
      () => {},
    ),
    /empty phrase/,
  );
});
