import test from "node:test";
import assert from "node:assert/strict";
import {
  rankSongs,
  simplifyQuery,
  splitQuery,
  byArtist,
  artistsOf,
  toggleArtist,
  hasArtist,
} from "../../web/search.mjs";
import { parseBackup } from "../../web/core.mjs";

const song = (id, title, artist, album = "") => ({ id, title, artist, album });

test("exact title and artist matches outrank karaoke and live versions", () => {
  const ranked = rankSongs(
    [
      song(1, "Halo (Karaoke Version)", "Tribute Stars", "Karaoke Hits"),
      song(2, "Halo (Live)", "Beyoncé", "I Am... World Tour"),
      song(3, "Halo", "Beyoncé", "I Am... Sasha Fierce"),
    ],
    "halo by beyonce",
  );
  assert.deepEqual(
    ranked.map((item) => item.id),
    [3, 2, 1],
  );
});

test("queries split on 'by' and dashes, and noise is stripped", () => {
  assert.deepEqual(splitQuery("Halo by Beyoncé"), {
    title: "Halo",
    artist: "Beyoncé",
  });
  assert.deepEqual(splitQuery("Halo - Beyoncé"), {
    title: "Halo",
    artist: "Beyoncé",
  });
  assert.equal(simplifyQuery("Halo (Official Video) lyrics feat. Jay"), "Halo");
});

test("artist filtering ignores accents and includes collaborations", () => {
  const songs = [
    song(1, "A", "Beyoncé"),
    song(2, "B", "Beyoncé & Jay-Z"),
    song(3, "C", "Adele"),
  ];
  assert.deepEqual(
    byArtist(songs, "beyonce").map((item) => item.id),
    [1, 2],
  );
  assert.deepEqual(
    artistsOf(songs).map((artist) => artist.name),
    ["Adele", "Beyoncé", "Beyoncé & Jay-Z"],
  );
});

test("favorite artists toggle case-insensitively and stay sorted", () => {
  let list = toggleArtist([], "Beyoncé");
  list = toggleArtist(list, "Adele");
  assert.deepEqual(list, ["Adele", "Beyoncé"]);
  assert.ok(hasArtist(list, "beyonce"));
  assert.deepEqual(toggleArtist(list, "BEYONCE"), ["Adele"]);
});

test("backups carry favorite artists and ignore junk", () => {
  const backup = {
    app: "lyrica-web",
    songs: [],
    favoriteArtists: ["Adele", 7, "", "Adele"],
  };
  assert.deepEqual(parseBackup(backup).favoriteArtists, ["Adele"]);
  assert.deepEqual(parseBackup({ app: "lyrica-web", songs: [] }).favoriteArtists, []);
});
