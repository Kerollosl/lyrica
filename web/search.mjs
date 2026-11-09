// Pure search helpers: query cleanup, ranking, and artist bookkeeping.

const fold = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Accent- and punctuation-insensitive form used to compare names. */
export const normalizeName = fold;
export const sameArtist = (a, b) => fold(a) === fold(b);

/**
 * Loosen a query that returned too little: drop bracketed notes, "feat." tails,
 * punctuation and filler such as "lyrics", so "Song (Official Video) lyrics" still matches.
 */
export function simplifyQuery(query) {
  return String(query ?? "")
    .replace(/[([{][^)\]}]*[)\]}]/g, " ")
    .replace(/\b(?:feat|ft|featuring)\b\.?.*$/i, " ")
    .replace(/\b(?:official|lyrics?|lyric video|audio|video|letra)\b/gi, " ")
    .replace(/[^\p{L}\p{N}\s'’-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split "Title by Artist" or "Title - Artist" so each side can be ranked separately. */
export function splitQuery(query) {
  const match = String(query ?? "").match(/^(.+?)\s+(?:by|-|–|—)\s+(.+)$/i);
  return match
    ? { title: match[1].trim(), artist: match[2].trim() }
    : { title: "", artist: "" };
}

/** Remove repeated songs (same id), keeping the first occurrence. */
export const uniqueSongs = (songs) => [
  ...new Map(songs.map((song) => [song.id, song])).values(),
];

/** Order results so exact title/artist matches come first; ties keep Apple's order. */
export function rankSongs(songs, query) {
  const { title, artist } = splitQuery(query);
  const whole = fold(query);
  const tokens = whole.split(" ").filter(Boolean);
  const wantTitle = fold(title);
  const wantArtist = fold(artist);
  const wantsVariant = /\b(karaoke|tribute|instrumental)\b/.test(whole);
  const wantsLive = /\blive\b/.test(whole);
  const score = (song) => {
    const t = fold(song.title);
    const a = fold(song.artist);
    const album = fold(song.album);
    const titleWords = t.split(" ");
    let points = 0;
    if (t === whole) points += 60;
    if (wantTitle && t === wantTitle) points += 50;
    if (wantArtist && a.includes(wantArtist)) points += 40;
    if (a === whole) points += 30;
    for (const token of tokens) {
      if (titleWords.includes(token)) points += 6;
      else if (t.includes(token)) points += 3;
      if (a.includes(token)) points += 4;
      if (album.includes(token)) points += 1;
    }
    // Studio recordings beat karaoke, tribute, and live versions unless asked for.
    if (
      !wantsVariant &&
      /\b(karaoke|tribute|made famous|instrumental|originally performed)\b/.test(
        `${t} ${album} ${a}`,
      )
    )
      points -= 25;
    if (!wantsLive && /\blive\b/.test(`${t} ${album}`)) points -= 8;
    return points;
  };
  return songs
    .map((song, index) => ({ song, index, points: score(song) }))
    .sort((a, b) => b.points - a.points || a.index - b.index)
    .map((entry) => entry.song);
}

/** Songs credited to an artist; also matches collaborations like "A & B". */
export function byArtist(songs, name) {
  const want = fold(name);
  if (!want) return songs;
  return songs.filter((song) => {
    const credited = fold(song.artist);
    return (
      credited === want ||
      ` ${credited} `.includes(` ${want} `)
    );
  });
}

/** Distinct artists in a list of songs, most songs first. */
export function artistsOf(songs, limit = 8) {
  const counts = new Map();
  for (const song of songs) {
    const key = fold(song.artist);
    if (!key) continue;
    const entry = counts.get(key) || { name: song.artist, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export const hasArtist = (list, name) =>
  list.some((item) => sameArtist(item, name));

/** Add or remove an artist, matching ignoring case and accents. */
export function toggleArtist(list, name) {
  return hasArtist(list, name)
    ? list.filter((item) => !sameArtist(item, name))
    : [...list, name].sort((a, b) => a.localeCompare(b));
}
