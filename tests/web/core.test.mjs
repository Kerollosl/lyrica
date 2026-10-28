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
