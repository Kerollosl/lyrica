export const languages = {
  en: "English",
  es: "Español",
  fr: "Français",
  ar: "العربية",
  it: "Italiano",
  pt: "Português",
  de: "Deutsch",
  ja: "日本語",
  ko: "한국어",
  "zh-Hans": "中文（简体）",
  hi: "हिन्दी",
  tr: "Türkçe",
  ru: "Русский",
  nl: "Nederlands",
  he: "עברית",
};
export const rtl = (code) => /^(ar|he|fa|ur)(-|$)/.test(code || "");
export const escapeHTML = (text) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export function cleanLyrics(text) {
  return String(text)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter(
      (line) =>
        !/^\s*\[(ar|ti|al|by|offset|re|ve|length):[^\]]*\]\s*$/i.test(line),
    )
    .map((line) =>
      line
        .replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, "")
        .replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, "")
        .trim(),
    )
    .join("\n")
    .trim();
}
export const normalize = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function appleReference(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Paste a complete Apple Music song link.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    !["music.apple.com", "geo.music.apple.com", "itunes.apple.com"].includes(
      url.hostname,
    )
  )
    throw new Error(
      "Use a song link from music.apple.com, or search by title and artist.",
    );
  const path = url.pathname.split("/").filter(Boolean);
  const raw =
    url.searchParams.get("i") ||
    (path.includes("song") ? path.at(-1)?.replace(/^id/, "") : null);
  if (
    !(path.includes("song") || path.includes("album")) ||
    !/^\d+$/.test(raw || "") ||
    !Number.isSafeInteger(Number(raw)) ||
    Number(raw) <= 0
  )
    throw new Error(
      "This link identifies an album. In Apple Music, choose Share Song instead.",
    );
  return {
    id: Number(raw),
    country: /^[a-z]{2}$/i.test(path[0] || "") ? path[0].toUpperCase() : "US",
  };
}
export function recordScore(record, song) {
  if (
    normalize(record.trackName) !== normalize(song.title) ||
    normalize(record.artistName) !== normalize(song.artist)
  )
    return null;
  const album =
    Boolean(song.album) &&
    normalize(record.albumName) === normalize(song.album);
  if (record.duration > 0 && song.duration > 0) {
    const delta = Math.abs(record.duration - song.duration);
    return delta <= 5 ? 1 + (album ? 0.3 : 0) + (5 - delta) * 0.04 : null;
  }
  return album ? 1.1 : null;
}
export function documentFrom(record) {
  if (record.instrumental)
    throw new Error(
      "This recording is listed as instrumental. You can paste lyrics if that’s incorrect.",
    );
  const text = [record.plainLyrics, record.syncedLyrics]
    .map((text) => cleanLyrics(text || ""))
    .find(Boolean);
  if (!text)
    throw new Error(
      "No lyrics are available for this recording. Paste lyrics you’re permitted to use.",
    );
  return { text, source: "lrclib" };
}
export function matchRecording(records, song) {
  const ranked = records
    .map((record) => ({ record, score: recordScore(record, song) }))
    .filter((item) => item.score !== null)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length)
    throw new Error(
      "No confident lyrics match for this recording. Try another recording or paste lyrics.",
    );
  const best = ranked[0];
  for (const other of ranked
    .slice(1)
    .filter((other) => best.score - other.score < 0.08)) {
    if (
      cleanLyrics(best.record.plainLyrics || best.record.syncedLyrics || "") !==
        cleanLyrics(
          other.record.plainLyrics || other.record.syncedLyrics || "",
        ) ||
      best.record.instrumental !== other.record.instrumental
    )
      throw new Error(
        "Several recordings have conflicting lyrics. Choose another result or paste lyrics for your version.",
      );
  }
  return documentFrom(best.record);
}
export function alignTranslation(original, translated) {
  const source = original.split("\n");
  const lines = translated
    .trim()
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim());
  if (
    lines.length === source.length &&
    source.every((line, i) => line || !lines[i])
  )
    return lines;
  const nonempty = lines.filter(Boolean);
  if (nonempty.length !== source.filter(Boolean).length)
    throw new Error(
      `Use one translated line for each original line (${source.filter(Boolean).length} lines). Blank verses are restored automatically.`,
    );
  let index = 0;
  return source.map((line) => (line ? nonempty[index++] : ""));
}
export function storageRecord(reader, favorite, cache) {
  return {
    id: String(reader.song.id),
    song: reader.song,
    favorite,
    viewed: Date.now(),
    document: cache ? reader.document : null,
    translations: cache ? reader.translations : {},
  };
}
export const demo = {
  song: {
    id: "lyrica-original-demo",
    title: "Donde empieza el día",
    artist: "Lyrica Studio",
    album: "An original bilingual demo",
    duration: 0,
    demo: true,
  },
  document: {
    source: "demo",
    language: "es",
    text: "Abro la ventana al día\ny la luz me viene a encontrar.\n\nCada calle guarda una historia,\ncada voz, un nuevo lugar.\n\nSi las palabras son un puente,\nhoy lo vamos a cruzar.",
  },
  translations: {
    "es:en": [
      "I open the window to the day",
      "and the light comes to find me.",
      "",
      "Every street holds a story,",
      "every voice, a new place.",
      "",
      "If words are a bridge,",
      "today we will cross it.",
    ],
    "es:fr": [
      "J’ouvre la fenêtre sur le jour",
      "et la lumière vient me trouver.",
      "",
      "Chaque rue garde une histoire,",
      "chaque voix, un lieu nouveau.",
      "",
      "Si les mots sont un pont,",
      "aujourd’hui nous le traverserons.",
    ],
    "es:ar": [
      "أفتح النافذة للنهار",
      "فيأتي الضوء ليجدني.",
      "",
      "كل شارع يحمل حكاية،",
      "وكل صوت مكانًا جديدًا.",
      "",
      "إن كانت الكلمات جسرًا،",
      "فسنعبره اليوم.",
    ],
    "es:it": [
      "Apro la finestra al giorno",
      "e la luce viene a cercarmi.",
      "",
      "Ogni strada custodisce una storia,",
      "ogni voce, un luogo nuovo.",
      "",
      "Se le parole sono un ponte,",
      "oggi lo attraverseremo.",
    ],
    "es:pt": [
      "Abro a janela para o dia",
      "e a luz vem me encontrar.",
      "",
      "Cada rua guarda uma história,",
      "cada voz, um novo lugar.",
      "",
      "Se as palavras são uma ponte,",
      "hoje vamos atravessá-la.",
    ],
  },
};
