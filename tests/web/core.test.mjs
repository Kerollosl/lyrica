import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanLyrics,
  appleReference,
  matchRecording,
  alignTranslation,
  storageRecord,
  demo,
  escapeHTML,
} from "../../web/core.mjs";
test("timestamps and metadata are stripped while verses survive", () =>
  assert.equal(
    cleanLyrics("[ar:Artist]\r\n[00:01.20]Hola\r\n\r\n[01:00]Mundo"),
    "Hola\n\nMundo",
  ));
test("Apple song URLs resolve identifiers and storefronts", () =>
  assert.deepEqual(
    appleReference("https://music.apple.com/es/album/a/123?i=456"),
    { id: 456, country: "ES" },
  ));
test("album-only, spoofed hosts and unsafe identifiers are rejected", () => {
  for (const url of [
    "https://music.apple.com/us/album/a/123",
    "https://music.apple.com.evil.test/song/12",
    "https://music.apple.com/us/song/a/9999999999999999999999",
  ])
    assert.throws(() => appleReference(url));
});
const song = {
  id: 1,
  title: "Canción",
  artist: "Artist",
  album: "Album",
  duration: 200,
};
const record = {
  trackName: "Cancion",
  artistName: "Artist",
  albumName: "Album",
  duration: 200,
  instrumental: false,
  plainLyrics: "Hola\n\nMundo",
};
test("matches normalized metadata and prefers plain lyrics", () =>
  assert.equal(
    matchRecording([{ ...record, syncedLyrics: "[00:01]wrong" }], song).text,
    "Hola\n\nMundo",
  ));
test("wrong versions, durations and ambiguous lyrics are rejected", () => {
  assert.throws(() =>
    matchRecording([{ ...record, trackName: "Canción (Live)" }], song),
  );
  assert.throws(() => matchRecording([{ ...record, duration: 210 }], song));
  assert.throws(() =>
    matchRecording([record, { ...record, plainLyrics: "Different" }], song),
  );
});
test("manual translations restore blank verses and reject missing lines", () => {
  assert.deepEqual(alignTranslation("Hola\n\nMundo", "Hello\nWorld"), [
    "Hello",
    "",
    "World",
  ]);
  assert.throws(() => alignTranslation("Hola\nMundo", "Hello"));
});
test("metadata bookmarks never retain lyrics or translations without permission", () => {
  const record = storageRecord(demo, true, false);
  assert.equal(record.document, null);
  assert.deepEqual(record.translations, {});
  assert.equal(record.favorite, true);
  assert.equal(
    storageRecord(demo, true, true).document.text,
    demo.document.text,
  );
});
test("external metadata is escaped", () =>
  assert.equal(escapeHTML('<script>"&'), "&lt;script&gt;&quot;&amp;"));
test("all supplied demo languages align with original stanzas", () => {
  for (const lines of Object.values(demo.translations))
    assert.equal(lines.length, demo.document.text.split("\n").length);
});

test("interface counts use English plural forms", async () => {
  const { plural } = await import("../../web/core.mjs");
  assert.equal(plural(0, "song"), "0 songs");
  assert.equal(plural(1, "song"), "1 song");
  assert.equal(plural(2, "result"), "2 results");
});

test("script detection guesses only unambiguous writing systems", async () => {
  const { scriptLanguage } = await import("../../web/core.mjs");
  assert.equal(scriptLanguage("أفتح النافذة للنهار\nفيأتي الضوء ليجدني"), "ar");
  assert.equal(scriptLanguage("שלום עולם ומה שלומך"), "he");
  assert.equal(scriptLanguage("안녕하세요 여러분"), "ko");
  assert.equal(scriptLanguage("こんにちは世界のみなさん"), "ja");
  // Latin-script languages are left for the reader to choose.
  assert.equal(scriptLanguage("Abro la ventana al día"), "");
  assert.equal(scriptLanguage("ok"), "");
});

test("library backups are validated and respect the storage opt-in", async () => {
  const { parseBackup } = await import("../../web/core.mjs");
  const backup = {
    app: "lyrica-web",
    version: 1,
    recent: ["hola", 4],
    songs: [
      {
        id: "1",
        song: { id: 1, title: "Uno", artist: "A", album: "B", duration: 120, artworkURL: "javascript:alert(1)" },
        favorite: true,
        viewed: 5,
        document: { text: "Hola", source: "manual" },
        translations: { "es:en": ["Hello"], bad: [1] },
      },
      { song: { title: "No id" } },
    ],
  };
  const withheld = parseBackup(JSON.stringify(backup));
  assert.equal(withheld.records.length, 1);
  assert.equal(withheld.withheld, 1);
  assert.equal(withheld.records[0].document, null);
  assert.deepEqual(withheld.records[0].translations, {});
  assert.equal(withheld.records[0].song.artworkURL, undefined);
  assert.deepEqual(withheld.recent, ["hola"]);
  const allowed = parseBackup(backup, { allowContent: true });
  assert.equal(allowed.records[0].document.text, "Hola");
  assert.deepEqual(allowed.records[0].translations, { "es:en": ["Hello"] });
  assert.throws(() => parseBackup("{not json"), /isn’t a Lyrica library backup/);
  assert.throws(() => parseBackup({ app: "other", songs: [] }), /isn’t a Lyrica library backup/);
});

test("word-based guessing recognises common Latin-script languages and abstains when unsure", async () => {
  const { guessLanguage } = await import("../../web/core.mjs");
  assert.equal(guessLanguage("Abro la ventana al día\ny la luz me viene a encontrar.\n\nCada calle guarda una historia"), "es");
  assert.equal(guessLanguage("Je n’en peux plus de faire semblant\nTu me manques plus que je ne le pensais"), "fr");
  assert.equal(guessLanguage("Non so più come vivere senza di te\nperché ogni giorno sei nella mia testa"), "it");
  assert.equal(guessLanguage("Eu não sei mais como viver sem você\nporque todos os dias você está na minha mente"), "pt");
  assert.equal(guessLanguage("Ich weiß nicht mehr wie ich ohne dich leben soll\nweil du jeden Tag in meinem Kopf bist"), "de");
  assert.equal(guessLanguage("I don't know how to live without you\nbecause you are in my head every day"), "en");
  // Too little text, or no clear winner: no guess.
  assert.equal(guessLanguage("Hola mundo"), "");
  assert.equal(guessLanguage("la la la la la la la la la la"), "");
});
