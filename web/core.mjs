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
const pluralRules = new Intl.PluralRules("en");
/** "1 song", "2 songs": English plural forms for interface counts. */
export const plural = (count, one, other = `${one}s`) =>
  `${count} ${pluralRules.select(count) === "one" ? one : other}`;

/**
 * Guess a lyric's language from its writing system when the browser has no
 * language detector. Only unambiguous scripts are guessed; Latin-script
 * languages (Spanish, French, Italian…) are left for the reader to choose.
 */
export function scriptLanguage(text) {
  const letters = String(text || "").match(/\p{L}/gu) || [];
  if (letters.length < 4) return "";
  const share = (pattern) =>
    letters.filter((letter) => pattern.test(letter)).length / letters.length;
  if (share(/\p{Script=Arabic}/u) > 0.6) return "ar";
  if (share(/\p{Script=Hebrew}/u) > 0.6) return "he";
  if (share(/\p{Script=Hangul}/u) > 0.4) return "ko";
  if (share(/[\p{Script=Hiragana}\p{Script=Katakana}]/u) > 0.15) return "ja";
  if (share(/\p{Script=Han}/u) > 0.6) return "zh-Hans";
  if (share(/\p{Script=Devanagari}/u) > 0.6) return "hi";
  return "";
}

// Common function words, enough to tell the main Latin-script languages apart
// without any browser feature (iPhone browsers have no language detector).
const wordLists = {
  es: "el la los las un una unos unas y o pero que de del al en es son era soy eres estoy está estás tú yo me te se mi tu su lo le les nos por para con sin sobre como cuando donde porque más muy ya no sí hoy nada todo todos cada aquí allí ni hay",
  fr: "le la les un une des et ou mais que qui de du au aux en est sont était suis es je tu il elle nous vous ils elles me te se mon ton son ma ta sa mes tes ses pour avec sans sur dans comme quand où parce plus très déjà ne pas oui rien tout tous chaque ici ça c'est j'ai n'en",
  it: "il lo la i gli le un una uno e o ma che di del della dei in è sono era sei io tu lui lei noi voi loro mi ti si ci mio tuo suo per con senza su come quando dove perché più molto già non sì oggi niente tutto ogni qui là anche",
  pt: "o a os as um uma uns umas e ou mas que de do da dos das em no na nos nas é são era sou és eu tu ele ela nós vocês me te se meu teu seu para com sem sobre como quando onde porque mais muito já não sim hoje nada tudo cada aqui lá também",
  de: "der die das den dem ein eine und oder aber dass von zu in ist sind war bin bist ich du er sie es wir ihr mich dich sich mein dein sein für mit ohne auf wie wann wo weil mehr sehr schon nicht ja heute nichts alles jede hier auch",
  en: "the a an and or but that of to in is are was were am be i you he she it we they me my your his her our for with without on as when where because more very already not yes today nothing all every here also this there what",
};
const wordSets = Object.fromEntries(
  Object.entries(wordLists).map(([code, list]) => [code, new Set(list.split(" "))]),
);
/**
 * Guess a Latin-script lyric's language from common words. Returns "" unless
 * one language is clearly ahead, so a wrong guess is rare; the reader can
 * always correct it with the language picker.
 */
export function guessLanguage(text) {
  const words = (String(text || "").toLowerCase().match(/[\p{L}'’]+/gu) || []).map(
    (word) => word.replace(/’/g, "'"),
  );
  if (words.length < 6) return "";
  const scores = Object.entries(wordSets)
    .map(([code, set]) => [code, words.filter((word) => set.has(word)).length])
    .sort((a, b) => b[1] - a[1]);
  const [[best, top], [, next]] = scores;
  return top / words.length >= 0.2 && top >= next * 1.4 && top - next >= 2
    ? best
    : "";
}

const BACKUP_LIMIT = 5000;
/**
 * Validate a Lyrica library backup and return storage records in the existing
 * shape. Lyric content is kept only when offline storage is enabled, so an
 * import never stores lyrics the reader hasn't opted in to keep.
 */
export function parseBackup(json, { allowContent = false } = {}) {
  let data;
  try {
    data = typeof json === "string" ? JSON.parse(json) : json;
  } catch {
    throw new Error("This file isn’t a Lyrica library backup.");
  }
  if (data?.app !== "lyrica-web" || !Array.isArray(data.songs))
    throw new Error("This file isn’t a Lyrica library backup.");
  if (data.songs.length > BACKUP_LIMIT)
    throw new Error(`Backups can include up to ${BACKUP_LIMIT} songs.`);
  const text = (value) => (typeof value === "string" ? value : "");
  let withheld = 0;
  const records = data.songs.flatMap((record) => {
    const song = record?.song;
    if (!song || (typeof song.id !== "string" && typeof song.id !== "number"))
      return [];
    if (!text(song.title) || !text(song.artist)) return [];
    const https = (url) => (text(url).startsWith("https://") ? url : undefined);
    const document =
      record.document && typeof record.document.text === "string"
        ? { ...record.document, text: record.document.text }
        : null;
    const translations =
      record.translations && typeof record.translations === "object"
        ? Object.fromEntries(
            Object.entries(record.translations).filter(
              ([, lines]) =>
                Array.isArray(lines) &&
                lines.every((line) => typeof line === "string"),
            ),
          )
        : {};
    if (!allowContent && (document || Object.keys(translations).length))
      withheld++;
    return [
      {
        id: String(song.id),
        song: {
          id: song.id,
          title: text(song.title),
          artist: text(song.artist),
          album: text(song.album),
          duration: Number(song.duration) || 0,
          ...(https(song.artworkURL) && { artworkURL: song.artworkURL }),
          ...(https(song.appleMusicURL) && { appleMusicURL: song.appleMusicURL }),
          ...(song.demo === true && { demo: true }),
        },
        favorite: record.favorite === true,
        viewed: Number(record.viewed) || 0,
        document: allowContent ? document : null,
        translations: allowContent ? translations : {},
      },
    ];
  });
  return {
    records,
    withheld,
    favoriteArtists: Array.isArray(data.favoriteArtists)
      ? [
          ...new Set(
            data.favoriteArtists.filter(
              (name) => typeof name === "string" && name.trim(),
            ),
          ),
        ].slice(0, 500)
      : [],
    recent: Array.isArray(data.recent)
      ? data.recent.filter((query) => typeof query === "string").slice(0, 8)
      : [],
  };
}
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
    album: "An original bilingual example",
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
