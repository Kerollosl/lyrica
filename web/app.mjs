import { translationKey, translationUnits } from "./translation-text.mjs";
import { icon } from "./icons.mjs";
import {
  languages,
  rtl,
  escapeHTML as e,
  cleanLyrics,
  alignTranslation,
  storageRecord,
  demo,
  plural,
  scriptLanguage,
  guessLanguage,
  parseBackup,
} from "./core.mjs";
import { searchSongs, fetchLyrics } from "./services.mjs";
import { artistsOf, byArtist, hasArtist, toggleArtist, sameArtist } from "./search.mjs";
import * as db from "./store.mjs";
import { models, modelIsCached } from "./translation-models.mjs";
import {
  detectLanguage,
  translationStatus,
  translateLines,
  clearTranslationModels,
} from "./translation.mjs";

// Placeholders until the real pages are hosted. Replace both before the App Store submission (docs/STORE-CHECKLIST.md).
const PRIVACY_URL = "https://example.com/TODO_PRIVACY_URL";
const SUPPORT_URL = "https://example.com/TODO_SUPPORT_URL";
const main = document.querySelector("main");
const dialog = document.querySelector("dialog");
document
  .querySelectorAll("[data-icon]")
  .forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
const state = {
  page: "search",
  query: "",
  results: [],
  searched: false,
  busy: false,
  error: "",
  songs: [],
  recent: [],
  favoriteArtists: [],
  artistSearch: false,
  artistFilter: "",
  libraryArtist: "",
  reader: null,
  libraryQuery: "",
  favorites: false,
  settings: {
    target: "en",
    font: 21,
    theme: "system",
    cache: false,
    translationStyle: "context",
    study: false,
    offeredCache: false,
  },
  source: "",
  target: "en",
  lines: [],
  message: "",
  status: "",
  translating: false,
  modelDownload: false,
  selected: -1,
  revealed: new Set(),
  modelStatus: null,
  stacked: false,
  grouped: false,
};
let searchController,
  lyricsController,
  translationController,
  debounce,
  toastTimer,
  readerOrigin = "search",
  pendingSearch = false,
  returnPoint = null,
  revision = 0;
const options = (selected) =>
  Object.entries(languages)
    .map(
      ([code, name]) =>
        `<option value="${code}" ${code === selected ? "selected" : ""}>${name}</option>`,
    )
    .join("");

/* Feedback ---------------------------------------------------------------- */

function hideToast() {
  document.querySelector("#toast").classList.remove("visible", "has-action");
}
/** A short status message, optionally with one action such as Undo. */
function toast(message, action) {
  const element = document.querySelector("#toast");
  const text = document.createElement("span");
  text.textContent = message;
  element.replaceChildren(text);
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toast-action";
    button.textContent = action.label;
    button.addEventListener("click", async () => {
      hideToast();
      try {
        await action.run();
      } catch (error) {
        toast(error.message);
      }
    });
    element.append(button);
  }
  element.classList.toggle("has-action", Boolean(action));
  element.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 8000 : 5000);
}
/** Short screen-reader announcements through one persistent live region. */
function announce(message) {
  const element = document.querySelector("#announcer");
  if (!element) return;
  element.textContent = "";
  requestAnimationFrame(() => (element.textContent = message));
}

/* Settings ---------------------------------------------------------------- */

function updateBrowserTheme() {
  // Both theme-color metas (light and dark OS preference) follow the app's own theme.
  const paper = getComputedStyle(document.documentElement)
    .getPropertyValue("--paper")
    .trim();
  for (const meta of document.querySelectorAll('meta[name="theme-color"]'))
    meta.content = paper;
}
matchMedia("(prefers-color-scheme: dark)").addEventListener(
  "change",
  updateBrowserTheme,
);
function applySettings() {
  document.documentElement.dataset.theme = state.settings.theme;
  updateBrowserTheme();
  document.documentElement.style.setProperty(
    "--lyrics-size",
    `${state.settings.font}px`,
  );
}
async function saveSettings() {
  applySettings();
  try {
    // Mirrored so the chosen theme applies before first paint (see index.html).
    localStorage.setItem("lyrica-theme", state.settings.theme);
  } catch {
    /* Optional. */
  }
  await db.setPreference("settings", state.settings);
}
async function refreshModels() {
  const saved = {};
  for (const code of Object.keys(models)) saved[code] = await modelIsCached(code);
  let persisted = false;
  try {
    persisted = Boolean(await navigator.storage?.persisted?.());
  } catch {
    /* Unknown: treated as not guaranteed. */
  }
  state.modelStatus = { saved, persisted };
}
async function refreshSongs() {
  state.songs = (await db.allSongs()).sort((a, b) => b.viewed - a.viewed);
}

/* Rendering --------------------------------------------------------------- */

function cover(song, className = "") {
  return song.artworkURL?.startsWith("https://")
    ? `<img class="cover ${className}" src="${e(song.artworkURL)}" alt="" width="160" height="160" loading="lazy">`
    : `<div class="cover ${song.demo ? "demo-cover" : "placeholder-cover"} ${className}" aria-hidden="true">${song.demo ? "" : icon("note")}</div>`;
}
function songRow(song, index, action = "open-result", offline = false) {
  const minutes = `${Math.floor(song.duration / 60)}:${String(Math.floor(song.duration % 60)).padStart(2, "0")}`;
  return `<button class="song-row" data-action="${action}" data-index="${e(index)}">${cover(song)}<span class="song-info"><strong>${e(song.title)}</strong><span>${e(song.artist)}</span><small>${e(song.album)}</small></span><span class="song-duration ${offline ? "is-offline" : ""}">${offline ? `${icon("download")} Offline` : song.duration ? minutes : ""}</span>${icon("chevron")}</button>`;
}
let renderedPage = null;
function render() {
  const active = document.activeElement;
  const inMain = main.contains(active);
  const focused = inMain ? active.id : null;
  const focusedAction = inMain ? active.dataset.action : null;
  const focusedIndex = active?.dataset.index;
  const focusedRecord = active?.dataset.id;
  const statusFocused = Boolean(active?.closest?.("#translation-status"));
  const summaryFocused = active?.matches(".reader-options > summary");
  const optionsOpen = Boolean(document.querySelector(".reader-options")?.open);
  document.documentElement.dataset.page = state.page;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const current =
      link.dataset.nav ===
      (state.page === "reader" ? readerOrigin : state.page);
    link.classList.toggle("active", current);
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  main.innerHTML =
    state.page === "reader"
      ? readerView()
      : state.page === "library"
        ? libraryView()
        : state.page === "settings"
          ? settingsView()
          : searchView();
  // Page changes arrive with a soft rise; re-renders of the same page stay still.
  if (renderedPage !== state.page) main.dataset.enter = "";
  else delete main.dataset.enter;
  renderedPage = state.page;
  const heading = main.querySelector("h1");
  if (heading) {
    heading.id = "page-heading";
    heading.tabIndex = -1;
  }
  if (optionsOpen && state.page === "reader") {
    const menu = document.querySelector(".reader-options");
    if (menu) menu.open = true;
  }
  if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
  else if (focusedAction) {
    const candidates = [
      ...main.querySelectorAll(`[data-action="${focusedAction}"]`),
    ];
    const target = candidates.find(
      (element) =>
        element.dataset.index === focusedIndex &&
        element.dataset.id === focusedRecord,
    );
    target?.focus({ preventScroll: true });
  } else if (summaryFocused)
    main
      .querySelector(".reader-options > summary")
      ?.focus({ preventScroll: true });
  // A control that disappeared (such as Cancel once translation ends) hands
  // focus to its status message instead of dropping it on the page body.
  if (statusFocused && !main.contains(document.activeElement))
    document
      .querySelector("#translation-status")
      ?.focus({ preventScroll: true });
}
function focusPageHeading() {
  main.querySelector("h1")?.focus({ preventScroll: true });
}

function searchView() {
  const recentSongs = state.songs.slice(0, 6);
  return `<header class="discover-heading"><h1>Search songs</h1><p>Find lyrics by song, artist, or album.</p></header>
  <section class="search-panel" aria-label="Find a song"><form id="search-form" role="search"><div class="search-box">${icon("search")}<input type="search" id="song-search" name="song" aria-label="Search songs or paste an Apple Music link" aria-describedby="search-hint" placeholder="Song, artist, or album" value="${e(state.query)}" autocomplete="off" spellcheck="false" enterkeyhint="search"><button class="search-submit" type="submit" aria-label="Search">Search ${icon("arrow")}</button></div></form><div class="search-help"><span id="search-hint">${icon("link")} Or paste an Apple Music song link</span><span>Press <kbd>/</kbd> to search</span></div>
  ${state.recent.length ? `<div class="recent"><span>Recent</span>${state.recent.map((query, index) => `<button class="chip" data-action="recent" data-index="${index}">${icon("clock")}${e(query)}</button>`).join("")}<button class="plain" data-action="clear-recent">Clear</button></div>` : ""}<div id="search-results">${searchResults()}</div></section>
  <div id="discover" ${state.query.trim() ? "hidden" : ""}>${favoriteArtistChips()}<section class="demo-feature" aria-labelledby="demo-title"><div class="demo-art" aria-hidden="true"></div><div class="demo-copy"><h2 id="demo-title">Try an example</h2><p>Read a Spanish verse with included translations.</p><button class="demo-action" data-action="demo">Open example ${icon("arrow")}</button></div></section>
  ${recentSongs.length ? `<section class="recently-read"><div class="section-heading"><h2>Recently viewed</h2><a href="#library">Your library ${icon("arrow")}</a></div><div class="recent-cards">${recentSongs.map((record) => `<button class="collection-card" data-action="open-library" data-index="${e(record.id)}">${cover(record.song)}<strong>${e(record.song.title)}</strong><span>${e(record.song.artist)}</span>${record.document ? `<small>${icon("download")} Offline</small>` : ""}</button>`).join("")}</div></section>` : ""}</div>`;
}
function searchResults() {
  if (state.busy)
    return `<div class="search-skeleton" role="status" aria-label="Finding your song">${Array.from({ length: 4 }, () => '<div class="skeleton-row"><span class="skeleton skeleton-cover"></span><span class="skeleton-copy"><span class="skeleton skeleton-title"></span><span class="skeleton skeleton-subtitle"></span></span></div>').join("")}</div>`;
  if (state.error)
    return `<div class="notice" role="alert">${e(state.error)} <button class="plain" data-action="retry-search">Try again</button></div>`;
  if (!state.searched) return "";
  const shown = state.artistFilter
    ? byArtist(state.results, state.artistFilter)
    : state.results;
  const artists = artistsOf(state.results);
  return `<div class="section-heading"><h2>${state.artistSearch ? e(state.query) : "Choose your recording"}</h2><span>${plural(shown.length, "result")}</span></div>${artistBar(artists)}${shown.length ? `<div class="result-list">${shown.map((song) => songRow(song, state.results.indexOf(song))).join("")}</div>` : `<div class="empty-state">${icon("search")}<h2>No songs found</h2><p>Try another title, artist, or Apple Music song link.</p></div>`}<p class="search-help">Check the album and duration for remixes, live versions, and re-recordings.</p>`;
}
/** Artist filter chips for the current results, with favorite and "more by" controls. */
function artistBar(artists) {
  if (!artists.length || (artists.length < 2 && !state.artistFilter)) return "";
  const active = state.artistFilter;
  const chips = artists
    .map(
      ({ name, count }) =>
        `<button class="chip" data-action="filter-artist" data-artist="${e(name)}" aria-pressed="${sameArtist(name, active)}"${sameArtist(name, active) ? ' data-selected="true"' : ""}>${hasArtist(state.favoriteArtists, name) ? icon("heart", true) : ""}${e(name)} <small>${count}</small></button>`,
    )
    .join("");
  const controls = active
    ? `<div class="artist-actions"><button class="chip" data-action="favorite-artist" data-artist="${e(active)}" aria-pressed="${hasArtist(state.favoriteArtists, active)}">${icon("heart", hasArtist(state.favoriteArtists, active))}${hasArtist(state.favoriteArtists, active) ? "Favorite artist" : "Favorite this artist"}</button>${state.artistSearch ? "" : `<button class="chip" data-action="artist-search" data-artist="${e(active)}">${icon("search")}All songs by ${e(active)}</button>`}<button class="plain" data-action="filter-artist" data-artist="">Show all</button></div>`
    : "";
  return `<div class="artist-bar" role="group" aria-label="Filter by artist"><span>Artists</span>${chips}</div>${controls}`;
}
function favoriteArtistChips() {
  if (!state.favoriteArtists.length) return "";
  return `<section class="favorite-artists" aria-label="Favorite artists"><div class="section-heading"><h2>Favorite artists</h2></div><div class="artist-bar">${state.favoriteArtists.map((name) => `<button class="chip" data-action="artist-search" data-artist="${e(name)}">${icon("heart", true)}${e(name)}</button>`).join("")}</div></section>`;
}
/** Typing updates only the result region, so the caret and IME composition stay intact. */
function updateSearchRegion() {
  const results = document.querySelector("#search-results");
  if (results) results.innerHTML = searchResults();
  const discover = document.querySelector("#discover");
  if (discover) discover.hidden = Boolean(state.query.trim());
}

function libraryRecords() {
  const query = state.libraryQuery.trim().toLowerCase();
  const records = state.songs.filter(
    (record) =>
      (!state.favorites || record.favorite) &&
      (!state.libraryArtist || sameArtist(record.song.artist, state.libraryArtist)) &&
      (!query ||
        `${record.song.title} ${record.song.artist} ${record.song.album}`
          .toLowerCase()
          .includes(query)),
  );
  if (!records.length)
    return `<div class="empty-state">${icon(query ? "search" : state.favorites ? "heart" : "library")}<h2>${query ? "No matching songs" : state.favorites ? "No favorites yet" : "No songs yet"}</h2><p>${query ? "Try another title, artist, or album." : state.favorites ? "Open a song and select Favorite to keep it here." : "Songs you open will appear here."}</p>${query ? "" : `<button class="primary" data-action="demo">Open example ${icon("arrow")}</button>`}</div>`;
  return records
    .map(
      (record) =>
        `<article class="library-item">${songRow(record.song, record.id, "open-library", Boolean(record.document))}${
          state.favorites
            ? `<button class="icon-button unfavorite" data-action="unfavorite" data-id="${e(record.id)}" aria-label="Remove ${e(record.song.title)} from favorites">${icon("heart", true)}</button>`
            : `<button class="icon-button remove-song" data-action="remove" data-id="${e(record.id)}" aria-label="Remove ${e(record.song.title)} from library">${icon("close")}</button>`
        }</article>`,
    )
    .join("");
}
function libraryArtists() {
  const artists = artistsOf(state.songs.map((record) => record.song), 40);
  if (!artists.length) return "";
  const favorite = (name) => hasArtist(state.favoriteArtists, name);
  artists.sort((a, b) => Number(favorite(b.name)) - Number(favorite(a.name)));
  return `<div class="artist-bar library-artists" role="group" aria-label="Filter library by artist"><span>Artists</span>${artists.map(({ name, count }) => `<button class="chip" data-action="library-artist" data-artist="${e(name)}" aria-pressed="${sameArtist(name, state.libraryArtist)}"${sameArtist(name, state.libraryArtist) ? ' data-selected="true"' : ""}>${favorite(name) ? icon("heart", true) : ""}${e(name)} <small>${count}</small></button>`).join("")}</div>${state.libraryArtist ? `<div class="artist-actions"><button class="chip" data-action="favorite-artist" data-artist="${e(state.libraryArtist)}" aria-pressed="${favorite(state.libraryArtist)}">${icon("heart", favorite(state.libraryArtist))}${favorite(state.libraryArtist) ? "Favorite artist" : "Favorite this artist"}</button><button class="chip" data-action="artist-search" data-artist="${e(state.libraryArtist)}">${icon("search")}Find more songs</button><button class="plain" data-action="library-artist" data-artist="">Show all</button></div>` : ""}`;
}
function libraryView() {
  return `<header class="page-head"><h1 class="page-title">Library</h1></header><div class="library-tools"><div class="segmented" role="group" aria-label="Library filter"><button data-action="history" aria-pressed="${!state.favorites}" class="${!state.favorites ? "selected" : ""}">${icon("clock")} Recently viewed</button><button data-action="favorites" aria-pressed="${state.favorites}" class="${state.favorites ? "selected" : ""}">${icon("heart")} Favorites</button></div><div class="library-search-wrap">${icon("search")}<input type="search" class="library-search" id="library-search" name="library-query" aria-label="Search your library" aria-controls="library-records" placeholder="Find a saved song" value="${e(state.libraryQuery)}"></div></div><div id="library-artists">${libraryArtists()}</div><div id="library-records" class="${state.favorites ? "favorite-grid" : "library-list"}">${libraryRecords()}</div><p class="storage-note">${icon("download")} Offline marks lyrics saved in this browser, along with languages you’ve already translated. Other songs keep just the song details.</p>`;
}

function translatedCell(index) {
  const text = state.lines[index] || "";
  const attributes = `class="translated" lang="${e(state.target)}" dir="${rtl(state.target) ? "rtl" : "auto"}"`;
  if (!text)
    return state.translating
      ? `<span class="translated pending" aria-hidden="true"></span>`
      : `<span class="translated" aria-hidden="true"></span>`;
  if (state.settings.study && !state.revealed.has(index))
    return `<span class="translated concealed" lang="${e(state.target)}" dir="${rtl(state.target) ? "rtl" : "auto"}"><span aria-hidden="true">${e(text)}</span><span class="visually-hidden">Translation hidden</span></span>`;
  return `<span ${attributes}>${e(text)}</span>`;
}
function readerView() {
  const reader = state.reader;
  if (!reader) return "";
  const source = state.source || reader.document?.language || "";
  const hasTranslation = state.lines.some(Boolean);
  const study = state.settings.study;
  const units = reader.document
    ? translationUnits(reader.document.text, state.grouped ? "context" : "lines")
    : [];
  const lyricUnits = units.filter((unit) => unit.text);
  // One Tab stop for the lyrics; arrow keys move between lines.
  const focusIndex = lyricUnits.some((unit) => unit.start === state.selected)
    ? state.selected
    : lyricUnits[0]?.start;
  const panelClasses = [
    state.stacked && "stacked",
    !hasTranslation && !state.translating && "original-only",
    study && "study",
  ]
    .filter(Boolean)
    .join(" ");
  return `<div class="reader-top"><button class="back-button" data-action="back">${icon("back")} ${readerOrigin === "library" ? "Library" : "Search"}</button><div class="reader-actions"><button class="icon-button quiet" data-action="share" aria-label="Share song">${icon("share")}</button><button class="favorite-button" data-action="favorite" aria-pressed="${Boolean(reader.favorite)}">${icon("heart", reader.favorite)}<span>Favorite</span></button><details class="reader-options"><summary aria-label="Reader options">${icon("settings")}<span>Reader options</span></summary><div class="options-menu">
    <div class="menu-group" role="group" aria-labelledby="menu-display"><span class="menu-label" id="menu-display">Display</span><div class="font-controls"><span>Text size</span><span class="font-stepper"><button class="icon-button" data-action="smaller" aria-label="Smaller lyrics">A−</button><output aria-live="polite">${state.settings.font}px</output><button class="icon-button" data-action="larger" aria-label="Larger lyrics">A+</button></span></div><button class="layout-option" data-action="layout" aria-label="Switch between columns and stacked layout" aria-pressed="${state.stacked}">${icon("layout")} ${state.stacked ? "Use columns" : "Stack translations"}</button><button data-action="study" aria-pressed="${study}">${icon("eye")} Hide translations<span class="menu-check" aria-hidden="true">${study ? icon("check") : ""}</span></button></div>
    <div class="menu-group" role="group" aria-labelledby="menu-translation"><span class="menu-label" id="menu-translation">Translation</span><label class="visually-hidden" for="translation-style">Translation style</label><select id="translation-style"><option value="context" ${state.settings.translationStyle === "context" ? "selected" : ""}>In context</option><option value="lines" ${state.settings.translationStyle === "lines" ? "selected" : ""}>Line by line</option></select><small>In context keeps related lines together. Line by line keeps separate rows.</small><button data-action="retranslate" ${!reader.document ? "disabled" : ""}>${icon("languages")} Retranslate</button><button data-action="manual-translation" ${!reader.document ? "disabled" : ""}>${icon("note")} Paste a translation</button></div>
    <div class="menu-group" role="group" aria-labelledby="menu-lyrics"><span class="menu-label" id="menu-lyrics">Lyrics</span><button data-action="copy-lyrics" ${!reader.document ? "disabled" : ""}>${icon("copy")} Copy lyrics &amp; translation</button><button data-action="copy-link">${icon("link")} Copy link to song</button><button data-action="manual-original">${icon("text")} Paste or replace lyrics</button></div>
  </div></details></div></div>
  <header class="reader-song">${cover(reader.song)}<div><h1>${e(reader.song.title)}</h1><p><strong>${e(reader.song.artist)}</strong><span aria-hidden="true"> · </span>${e(reader.song.album)}</p></div></header>
  <div class="language-bar"><div class="language-control"><label for="source-language">Original</label><select id="source-language"><option value="" ${!source ? "selected" : ""}>Detect language</option>${options(source)}</select></div><span class="language-arrow" aria-hidden="true">${icon("arrow")}</span><div class="language-control"><label for="target-language">Translation</label><select id="target-language">${options(state.target)}</select></div></div><div id="translation-status" role="status" tabindex="-1">${translationNotice()}</div>
  ${
    reader.document
      ? `<section class="bilingual-panel ${panelClasses}" aria-label="Bilingual lyrics">${hasTranslation ? `<p class="reader-guide">${study ? "Tap a line to reveal its translation" : "Original above · translation below"}</p>` : ""}<div id="lyric-lines">${units
          .map(({ text: line, start: index }) =>
            line
              ? `<div class="lyric-row ${state.grouped ? "context-row" : ""}" role="button" tabindex="${index === focusIndex ? 0 : -1}" data-action="highlight" data-index="${index}" aria-pressed="${state.selected === index}"><span lang="${e(source || "und")}" dir="${rtl(source) ? "rtl" : "auto"}">${e(line)}</span>${translatedCell(index)}</div>`
              : '<div class="verse-space" aria-hidden="true"></div>',
          )
          .join("")}</div></section>`
      : reader.loading
        ? `<div class="reader-skeleton" aria-hidden="true">${Array.from({ length: 5 }, () => '<div class="skeleton-row"><span class="skeleton skeleton-title"></span><span class="skeleton skeleton-title"></span></div>').join("")}</div>`
        : ""
  }
  <footer class="lyric-foot"><p>${reader.song.demo ? "Original example lyrics and translations by Lyrica Studio. Fictional material, not a commercial recording." : reader.document?.source === "lrclib" ? 'Lyrics from <a href="https://lrclib.net" target="_blank" rel="noopener">LRCLIB</a>. Rights belong to their respective owners.' : "Lyrics supplied by you. Only use material you’re permitted to read and retain."}</p><p>Translations may miss poetry, idioms, or context. ${reader.song.appleMusicURL?.startsWith("https://") ? `<a href="${e(reader.song.appleMusicURL)}" target="_blank" rel="noopener">View in Apple Music ${icon("external")}</a>` : ""}</p></footer>`;
}
function translationNotice() {
  if (state.reader?.loading)
    return '<div class="notice"><span class="spinner"></span><span class="status-text">Finding lyrics…</span></div>';
  if (!state.message) return "";
  const reader = state.reader;
  let actions = "";
  if (state.translating)
    actions = '<button class="plain" data-action="cancel-translation">Cancel</button>';
  else if (!reader?.document)
    actions =
      '<button class="plain" data-action="retry-lyrics">Retry</button><button class="plain" data-action="manual-original">Paste lyrics</button>';
  else if (!state.lines.length) {
    if (state.status === "source-needed")
      actions =
        '<button class="plain" data-action="choose-source">Choose language</button>';
    else if (state.status === "unavailable" || state.status === "missing")
      actions =
        '<button class="plain" data-action="manual-translation">Paste translation</button>';
    else
      actions = `<button class="plain" data-action="translate">${state.modelDownload ? "Download & translate" : "Translate on this device"}</button><button class="plain" data-action="manual-translation">Paste translation</button>`;
  }
  return `<div class="notice status-inline">${state.translating ? '<span class="spinner"></span>' : ""}<span class="status-text">${e(state.message)}</span>${actions}</div>`;
}
function modelList() {
  const status = state.modelStatus;
  if (!status) return "";
  const rows = Object.entries(models)
    .map(
      ([code, model]) =>
        `<li><span>${e(model.name)} → English</span><span class="${status.saved[code] ? "model-saved" : ""}">${status.saved[code] ? "Saved on this device" : "Not downloaded"}</span></li>`,
    )
    .join("");
  const any = Object.values(status.saved).some(Boolean);
  return `<div class="model-list"><h3>Translation languages</h3><ul>${rows}</ul>${
    any
      ? status.persisted
        ? `<p>Your browser has agreed to keep these.</p>`
        : `<p>Your browser may delete these when space is low or after a long time unused. <button class="plain" data-action="keep-models">Ask the browser to keep them</button></p>`
      : ""
  }</div>`;
}
function settingsView() {
  const saved = state.songs.filter((song) => song.document).length;
  const favorites = state.songs.filter((song) => song.favorite).length;
  return `<header class="page-head"><h1 class="page-title">Settings</h1></header><div class="settings-grid">
  <section class="setting-section"><h2>${icon("text")} Reading</h2><div class="setting-row"><label for="default-language">Default translation language</label><select id="default-language">${options(state.settings.target)}</select></div><div class="setting-row"><label for="font-size">Lyrics text size <small id="font-value">${state.settings.font}px</small></label><input id="font-size" type="range" min="15" max="30" value="${state.settings.font}"></div><label class="setting-row switch-row" for="study"><span>Hide translations<small>Read the original first, then tap a line to reveal it.</small></span><span class="switch-target"><input id="study" type="checkbox" role="switch" ${state.settings.study ? "checked" : ""}></span></label></section>
  <section class="setting-section"><h2>${icon("settings")} Appearance</h2><div class="setting-row"><label for="theme">Color theme<small>Follow your device, or choose your own.</small></label><select id="theme">${["system", "light", "dark"].map((value) => `<option value="${value}" ${value === state.settings.theme ? "selected" : ""}>${value[0].toUpperCase() + value.slice(1)}</option>`).join("")}</select></div></section>
  <section class="setting-section"><h2>${icon("download")} Storage</h2><label class="setting-row switch-row cache-setting" for="cache"><span>Save permitted lyrics offline<small>Only save lyrics and translations you’re permitted to keep.</small></span><span class="switch-target"><input id="cache" type="checkbox" role="switch" ${state.settings.cache ? "checked" : ""}></span></label><p class="storage-summary">${plural(saved, "song")} saved offline · ${plural(favorites, "favorite")}. Stored in this browser, separate from your iPhone library.${db.storage.persistent ? "" : " <strong>This browser is blocking storage, so changes last only until you close this tab.</strong>"}</p>
  ${modelList()}
  <div class="action-list"><button class="action-row" data-action="export-library">${icon("download")} Export library backup</button><button class="action-row" data-action="import-library">${icon("upload")} Import a backup</button><input type="file" id="import-file" accept="application/json,.json" hidden><button class="action-row" data-action="clear-models">${icon("languages")} Remove downloaded language models</button><button class="action-row" data-action="clear-cache">${icon("note")} Clear lyrics & translations</button><button class="action-row" data-action="clear-recent">${icon("clock")} Clear recent searches</button><button class="action-row danger" data-action="delete-all">${icon("close")} Delete library & history</button></div></section>
  <details class="setting-section about-details"><summary>About Lyrica & privacy</summary><div class="about-content"><p>Search and metadata come from Apple’s iTunes API. Lyrics come from LRCLIB. Availability does not grant copyright or redistribution rights. Only paste or store material you’re authorized to use.</p><p>Spanish, Arabic, and French → English can run privately in your browser using downloadable OPUS-MT translation models. Choose the original language, then download its model when prompted (about 110–120 MB per language, plus a shared 23 MB engine). The default In context style translates related lines together to preserve meaning. Reader options lets you compare Line by line or retranslate older saved text. Compact models can still miss idioms, dialect and poetry. Speed and memory use depend on your phone. Models are saved in this browser and reused. Browsers may still clear site data after a long time unused (Safari does so after about a week unless Lyrica is added to your Home Screen); you can remove them above. Supported desktop browsers may use their built-in translator instead. Apple Translation is exclusive to the native iPhone app.</p><p>Queries go directly to Apple, and recording metadata goes directly to LRCLIB. Language models download from Hugging Face; your lyric text is processed locally and is not sent there. Lyrica has no analytics, accounts, server, paid API, or cloud sync. Only the application shell is cached automatically; lyric storage is opt-in. Clearing browser data removes your library, so export a backup first. Browser-managed translation models are managed by the browser.</p><p><a href="${PRIVACY_URL}" target="_blank" rel="noopener">Privacy policy</a> · <a href="${SUPPORT_URL}" target="_blank" rel="noopener">Support</a></p><a class="plain" href="https://github.com/Kerollosl/lyrica" target="_blank" rel="noopener">Explore the iPhone app and source ${icon("external")}</a></div></details></div>`;
}

/* Search ------------------------------------------------------------------ */

async function search() {
  searchController?.abort();
  searchController = new AbortController();
  const controller = searchController;
  state.query =
    document.querySelector("#song-search")?.value.trim() ?? state.query;
  state.results = [];
  state.error = "";
  state.searched = false;
  state.artistFilter = "";
  if (!state.query) {
    state.busy = false;
    updateSearchRegion();
    return;
  }
  state.busy = true;
  updateSearchRegion();
  try {
    const results = await searchSongs(state.query, controller.signal, {
      artist: state.artistSearch,
    });
    if (controller.signal.aborted) return;
    state.results = results;
    state.searched = true;
    // A pasted Apple Music link identifies exactly one recording: open it directly.
    if (/^https?:\/\//i.test(state.query) && results.length === 1) {
      await remember(state.query);
      state.busy = false;
      await openSong(results[0]);
      return;
    }
    announce(
      results.length ? plural(results.length, "result") : "No songs found",
    );
  } catch (error) {
    if (controller.signal.aborted) return;
    state.error = error.message;
  } finally {
    if (!controller.signal.aborted) {
      state.busy = false;
      if (state.page === "search") updateSearchRegion();
    }
  }
}
async function remember(query) {
  if (!query.trim()) return;
  state.recent = [
    query,
    ...state.recent.filter((item) => item !== query),
  ].slice(0, 8);
  await db.setPreference("recent", state.recent);
}

/* Reader ------------------------------------------------------------------ */

async function persist() {
  if (!state.reader) return;
  await db.putSong(
    storageRecord(state.reader, state.reader.favorite, state.settings.cache),
  );
  await refreshSongs();
}
const songRoute = (id) => `#song/${encodeURIComponent(id)}`;
function routeSongID() {
  const match = location.hash.match(/^#song\/(.+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
async function openSong(song, saved, { fromRoute = false } = {}) {
  lyricsController?.abort();
  translationController?.abort();
  revision++;
  if (fromRoute) {
    readerOrigin = history.state?.from === "library" ? "library" : "search";
  } else {
    // Remember where the reader was opened so Back can return to the same place.
    if (state.page !== "reader") {
      const active = document.activeElement;
      returnPoint = {
        page: state.page,
        y: window.scrollY,
        action: main.contains(active) ? active.dataset.action : null,
        index: main.contains(active) ? active.dataset.index : null,
      };
      readerOrigin = state.page === "library" ? "library" : "search";
    }
    const route = songRoute(song.id);
    if (location.hash !== route)
      history.pushState({ lyrica: true, from: readerOrigin }, "", route);
  }
  state.page = "reader";
  state.source = "";
  state.target = state.settings.target;
  state.lines = [];
  state.message = "";
  state.status = "";
  state.selected = -1;
  state.revealed = new Set();
  let existing = saved;
  if (!existing) {
    try {
      existing = await db.getSong(song.id);
    } catch {
      existing = null;
    }
  }
  state.reader = {
    song,
    document: existing?.document || null,
    translations: existing?.translations || {},
    favorite: existing?.favorite || false,
    loading: false,
  };
  if (song.demo) {
    state.reader.document = structuredClone(demo.document);
    state.reader.translations = {
      ...demo.translations,
      ...state.reader.translations,
    };
    state.source = "es";
  }
  render();
  focusPageHeading();
  window.scrollTo(0, 0);
  try {
    await persist();
  } catch (error) {
    // Reading continues even when this browser can't save history.
    toast(error.message);
  }
  if (state.reader.document) await prepare();
  else await loadLyrics();
}
async function openSongByID(id) {
  if (id === demo.song.id) return openSong(demo.song, undefined, { fromRoute: true });
  let saved = null;
  try {
    saved = await db.getSong(id);
  } catch {
    saved = null;
  }
  if (saved) return openSong(saved.song, saved, { fromRoute: true });
  if (/^\d+$/.test(id)) {
    // A shared link to a song this browser hasn't opened: look up its details.
    document.documentElement.dataset.page = "reader";
    main.innerHTML = `<div class="notice" role="status"><span class="spinner"></span>Opening song…</div>`;
    try {
      const [song] = await searchSongs(
        `https://music.apple.com/us/song/${id}`,
        new AbortController().signal,
      );
      if (song && routeSongID() === id)
        return openSong(song, undefined, { fromRoute: true });
    } catch (error) {
      toast(error.message);
    }
    if (routeSongID() !== id) return;
  } else toast("That song isn’t in this browser’s library.");
  history.replaceState(null, "", "#search");
  return navigate(true);
}
async function loadLyrics() {
  lyricsController?.abort();
  const controller = new AbortController();
  lyricsController = controller;
  const reader = state.reader;
  reader.loading = true;
  state.message = "";
  render();
  try {
    const document = await fetchLyrics(reader.song, controller.signal);
    if (controller.signal.aborted || state.reader !== reader) return;
    reader.document = document;
    await persist();
  } catch (error) {
    if (!controller.signal.aborted && state.reader === reader)
      state.message = error.message;
  } finally {
    if (!controller.signal.aborted && state.reader === reader) {
      reader.loading = false;
      render();
      if (reader.document) await prepare();
    }
  }
}
async function prepare(userGesture = false, force = false) {
  translationController?.abort();
  const controller = new AbortController();
  translationController = controller;
  const token = ++revision;
  state.lines = [];
  state.translating = false;
  state.modelDownload = false;
  state.grouped = false;
  state.message = "";
  state.status = "";
  state.revealed = new Set();
  const reader = state.reader;
  if (!reader?.document) return;
  try {
    if (!state.source) {
      const detected =
        reader.document.language ||
        (await detectLanguage(reader.document.text)) ||
        scriptLanguage(reader.document.text) ||
        guessLanguage(reader.document.text) ||
        "";
      if (token !== revision) return;
      state.source = detected;
    }
    if (token !== revision) return;
    const key = translationKey(
      state.source,
      state.target,
      state.settings.translationStyle,
    );
    const legacyKey = `${state.source}:${state.target}`;
    const cachedKey = reader.translations[key] ? key : legacyKey;
    if (!force && reader.translations[cachedKey]) {
      state.grouped =
        cachedKey === key && state.settings.translationStyle === "context";
      state.lines = reader.translations[cachedKey];
      state.message = reader.song.demo
        ? ""
        : state.settings.cache
          ? "Saved translation · Offline."
          : "Translation from this session.";
      if (state.grouped)
        state.message += " Related original lines are shown together.";
      else if (!reader.song.demo && cachedKey === legacyKey)
        state.message +=
          " Use Retranslate in Reader options to try the updated translator.";
      render();
      return;
    }
    const status = await translationStatus(state.source, state.target);
    if (token !== revision) return;
    state.status = status;
    if (status === "same") {
      state.lines = reader.document.text.split("\n");
      state.message = "The original is already in this language.";
    } else if (status === "missing")
      state.message =
        "This browser doesn’t offer on-device translation. Use supported desktop Chrome, paste a translation, or try the bilingual example.";
    else if (status === "source-needed")
      state.message =
        "Lyrica couldn’t tell which language this is. Choose it to translate on this device.";
    else if (status === "unavailable")
      state.message =
        "Automatic mobile translation supports Spanish, Arabic, and French → English. Choose one of these pairs, or paste a translation.";
    else if (status === "model-download" && !userGesture) {
      state.modelDownload = true;
      state.message =
        "Download this language to translate privately on your phone. About 110–120 MB, plus a shared 23 MB engine. Free; lyrics stay on your device. Downloaded models are reused while browser storage is retained.";
    } else if (
      status !== "available" &&
      status !== "model-ready" &&
      !userGesture
    )
      state.message =
        "A free language-model download is needed. Select “Translate on this device” to begin.";
    else {
      state.translating = true;
      state.grouped = state.settings.translationStyle === "context";
      state.selected = -1;
      state.message = state.grouped
        ? "Translating with context on your device… Related original lines are shown together."
        : "Translating privately on your device…";
      render();
      const lines = await translateLines(
        reader.document.text,
        state.source,
        state.target,
        {
          signal: controller.signal,
          style: state.settings.translationStyle,
          engine: status.startsWith("model-") ? "model" : "native",
          onLine(index, text) {
            if (token !== revision) return;
            state.lines[index] = text;
            const cell = document.querySelector(
              `.lyric-row[data-index="${index}"] .translated`,
            );
            if (cell) cell.outerHTML = translatedCell(index);
          },
          progress(message) {
            if (token !== revision) return;
            state.message = message;
            // Update only the text so the Cancel button keeps keyboard focus.
            const text = document.querySelector(
              "#translation-status .status-text",
            );
            if (text) text.textContent = message;
            else {
              const el = document.querySelector("#translation-status");
              if (el) el.innerHTML = translationNotice();
            }
          },
        },
      );
      if (token !== revision) return;
      state.lines = lines;
      reader.translations[key] = lines;
      state.message = state.grouped
        ? "Translated on your device. Related original lines are shown together for context."
        : "Translated on your device.";
      announce("Translation ready");
      // Ask the browser not to evict downloaded models under storage pressure.
      if (status.startsWith("model-")) navigator.storage?.persist?.().catch(() => {});
      await persist();
    }
  } catch (error) {
    if (token !== revision || controller.signal.aborted) return;
    state.lines = [];
    state.message = `Translation couldn’t finish. ${error.message} Try again or paste a translation.`;
  } finally {
    if (token === revision) {
      state.translating = false;
      if (state.page === "reader") render();
    }
  }
}

/* Lyric rows: highlight, reveal, keyboard movement and copying ------------- */

const lyricRows = () => [...main.querySelectorAll(".lyric-row")];
function refreshRow(index) {
  const row = main.querySelector(`.lyric-row[data-index="${index}"]`);
  if (!row) return;
  row.setAttribute("aria-pressed", String(state.selected === index));
  row.querySelector(".translated").outerHTML = translatedCell(index);
}
function toggleRow(row) {
  const index = Number(row.dataset.index);
  const previous = state.selected;
  const selecting = previous !== index;
  state.selected = selecting ? index : -1;
  if (state.settings.study) {
    if (selecting) state.revealed.add(index);
    else state.revealed.delete(index);
  }
  if (previous >= 0 && previous !== index) refreshRow(previous);
  refreshRow(index);
}
function focusRow(row, select = true) {
  for (const other of lyricRows()) other.tabIndex = other === row ? 0 : -1;
  row.focus();
  if (!select) return;
  const previous = state.selected;
  state.selected = Number(row.dataset.index);
  if (previous >= 0 && previous !== state.selected) refreshRow(previous);
  refreshRow(state.selected);
}
function pairText(row) {
  const original = row.querySelector("span").textContent;
  const translation = state.lines[Number(row.dataset.index)] || "";
  return translation && translation !== original
    ? `${original}\n${translation}`
    : original;
}
function lyricsText() {
  const reader = state.reader;
  const units = translationUnits(
    reader.document.text,
    state.grouped ? "context" : "lines",
  );
  const body = units
    .map(({ text, start }) => {
      if (!text) return "";
      const translation = state.lines[start] || "";
      return translation && translation !== text
        ? `${text}\n${translation}`
        : text;
    })
    .join("\n");
  return `${body}\n\n${reader.song.title} · ${reader.song.artist}`;
}
async function copy(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    toast("Copying isn’t available in this browser. Select the text instead.");
  }
}
const songLink = () =>
  new URL(songRoute(state.reader.song.id), location.href).href;

/* Dialogs ------------------------------------------------------------------ */

let dialogInitialText = "";
let dialogPending = false;
function dialogHasDraft() {
  const field = dialog.querySelector("#manual-text");
  return dialog.open && field && field.value !== dialogInitialText;
}
function requestDialogClose() {
  if (dialogPending) return;
  if (dialogHasDraft()) {
    dialog.querySelector(".error").textContent =
      "Your changes haven’t been saved. Keep editing or discard them.";
    dialog.querySelector('[data-action="discard-draft"]').hidden = false;
    return;
  }
  dialog.close();
}
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  requestDialogClose();
});
window.addEventListener("beforeunload", (event) => {
  if (dialogHasDraft()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
function showDialog(
  title,
  body,
  confirm,
  onConfirm,
  {
    textarea = "",
    confirmLabel = "Continue",
    cancelLabel = "Cancel",
    originalText = "",
    onCancel = null,
  } = {},
) {
  const opener = document.activeElement;
  const openerID = opener?.id;
  const openerAction = opener?.dataset.action;
  let confirmed = false;
  dialogPending = false;
  dialog.innerHTML = `<form id="dialog-form"><h2 id="dialog-title">${e(title)}</h2><p id="dialog-description">${e(body)}</p>${originalText ? `<details class="source-preview"><summary>View original lyrics</summary><pre>${e(originalText)}</pre></details>` : ""}${textarea ? `<label for="manual-text">${e(textarea)}</label><textarea id="manual-text" name="lyrics" spellcheck="false" aria-describedby="dialog-error"></textarea>` : ""}<p id="dialog-error" class="error" role="alert"></p><div class="dialog-actions"><button type="button" class="plain" data-action="close-dialog">${e(cancelLabel)}</button><button type="button" class="plain danger" data-action="discard-draft" hidden>Discard changes</button><button type="submit" class="primary">${e(confirmLabel || confirm)}</button></div></form>`;
  dialog.setAttribute("aria-labelledby", "dialog-title");
  dialog.setAttribute("aria-describedby", "dialog-description");
  dialog.onclose = () => {
    if (!confirmed) onCancel?.();
    queueMicrotask(() => {
      const target = opener?.isConnected
        ? opener
        : openerID
          ? document.getElementById(openerID)
          : openerAction
            ? main.querySelector(`[data-action="${openerAction}"]`)
            : null;
      if (
        target &&
        (target.checkVisibility
          ? target.checkVisibility()
          : target.getClientRects().length &&
            (!target.closest("details") || target.closest("details").open))
      )
        target.focus({ preventScroll: true });
      else
        main
          .querySelector(".reader-options > summary")
          ?.focus({ preventScroll: true });
    });
  };
  dialog.showModal();
  queueMicrotask(() => {
    const field = dialog.querySelector("#manual-text");
    dialogInitialText = field?.value ?? "";
    field?.focus();
  });
  document.querySelector("#dialog-form").onsubmit = async (event) => {
    event.preventDefault();
    if (dialogPending) return;
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    dialogPending = true;
    submit.disabled = true;
    form.setAttribute("aria-busy", "true");
    try {
      await onConfirm(document.querySelector("#manual-text")?.value);
      confirmed = true;
      dialog.close();
    } catch (error) {
      dialog.querySelector(".error").textContent = error.message;
      const field = dialog.querySelector("#manual-text");
      field?.setAttribute("aria-invalid", "true");
      field?.focus();
    } finally {
      dialogPending = false;
      submit.disabled = false;
      form.removeAttribute("aria-busy");
    }
  };
}
function permission(onConfirm) {
  showDialog(
    "Enable offline reading?",
    "Enable offline storage only for lyrics and translations you’re permitted to keep. They stay in this browser. Favorite bookmarks work without storing lyrics, and you can change this later in Settings.",
    "Enable",
    async () => {
      state.settings.cache = true;
      await saveSettings();
      await onConfirm?.();
      await persist();
      render();
    },
    {
      confirmLabel: "Enable permitted offline storage",
      cancelLabel:
        state.page === "reader" && state.reader?.favorite
          ? "Keep bookmark only"
          : "Not now",
    },
  );
}

/* Navigation ---------------------------------------------------------------- */

async function navigate(focus = false) {
  translationController?.abort();
  lyricsController?.abort();
  searchController?.abort();
  clearTimeout(debounce);
  revision++;
  const fromReader = state.page === "reader";
  state.translating = false;
  state.busy = false;
  state.page = ["library", "settings"].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "search";
  try {
    await refreshSongs();
    if (state.page === "settings") await refreshModels();
  } catch (error) {
    toast(error.message);
  }
  render();
  if (pendingSearch && state.page === "search") {
    pendingSearch = false;
    search().catch((error) => toast(error.message));
    return;
  }
  if (fromReader && returnPoint?.page === state.page) {
    // Return to the same place in the list the song was opened from.
    const { y, action, index } = returnPoint;
    returnPoint = null;
    window.scrollTo(0, y);
    const target =
      action &&
      [...main.querySelectorAll(`[data-action="${action}"]`)].find(
        (element) => element.dataset.index === index,
      );
    if (target) target.focus({ preventScroll: true });
    else if (focus) focusPageHeading();
    return;
  }
  if (focus) focusPageHeading();
  window.scrollTo(0, 0);
}
async function route(focus = true) {
  const id = routeSongID();
  if (id !== null) {
    if (state.page === "reader" && String(state.reader?.song.id) === id) return;
    return openSongByID(id);
  }
  return navigate(focus);
}
// In-page anchors such as the skip link (#main) are not routes.
const isRoute = (hash) =>
  ["", "#", "#search", "#library", "#settings"].includes(hash) ||
  hash.startsWith("#song/");
window.addEventListener("hashchange", () => {
  if (isRoute(location.hash)) route().catch((error) => toast(error.message));
});

/* Events -------------------------------------------------------------------- */

document.addEventListener("submit", (event) => {
  if (event.target.id === "search-form") {
    event.preventDefault();
    clearTimeout(debounce);
    state.artistSearch = false;
    search().catch((error) => toast(error.message));
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "song-search") {
    state.query = event.target.value;
    state.artistSearch = false;
    // Wait for IME composition to finish before searching.
    if (event.isComposing) return;
    searchController?.abort();
    clearTimeout(debounce);
    debounce = setTimeout(
      () => search().catch((error) => toast(error.message)),
      450,
    );
  }
  if (event.target.id === "library-search") {
    state.libraryQuery = event.target.value;
    if (event.isComposing) return;
    // Only the records change, so the field keeps its caret and composition.
    const records = document.querySelector("#library-records");
    if (records) records.innerHTML = libraryRecords();
  }
  if (event.target.id === "font-size") {
    state.settings.font = Number(event.target.value);
    document.querySelector("#font-value").textContent =
      `${state.settings.font}px`;
    saveSettings().catch((error) => toast(error.message));
  }
});
document.addEventListener("compositionend", (event) => {
  if (["song-search", "library-search"].includes(event.target.id))
    event.target.dispatchEvent(new Event("input", { bubbles: true }));
});
document.addEventListener("change", async (event) => {
  try {
    const id = event.target.id,
      value = event.target.value;
    if (id === "translation-style") {
      state.settings.translationStyle = value === "lines" ? "lines" : "context";
      await saveSettings();
      const key = translationKey(
        state.source,
        state.target,
        state.settings.translationStyle,
      );
      await prepare(false, !state.reader?.translations[key]);
    }
    if (id === "source-language") {
      state.source = value;
      await prepare();
    }
    if (id === "target-language") {
      state.target = value;
      await prepare();
    }
    if (id === "default-language") {
      state.settings.target = value;
      await saveSettings();
    }
    if (id === "theme") {
      state.settings.theme = value;
      await saveSettings();
    }
    if (id === "study") {
      state.settings.study = event.target.checked;
      await saveSettings();
    }
    if (id === "cache") {
      if (event.target.checked) {
        event.target.checked = false;
        permission();
      } else {
        // Turning storage off deletes saved lyrics, so confirm first.
        event.target.checked = true;
        showDialog(
          "Turn off offline reading?",
          "Saved lyrics and translations will be removed from this browser. Favorites and viewing history stay.",
          "Turn off",
          async () => {
            await db.clearContent();
            state.settings.cache = false;
            await saveSettings();
            await refreshSongs();
            render();
            toast("Offline lyrics removed");
          },
          { confirmLabel: "Turn off and remove lyrics", cancelLabel: "Keep offline lyrics" },
        );
      }
    }
    if (id === "import-file") {
      const [file] = event.target.files;
      event.target.value = "";
      if (file) await importLibrary(file);
    }
  } catch (error) {
    toast(error.message);
  }
});

async function exportLibrary() {
  const songs = await db.allSongs();
  const payload = {
    app: "lyrica-web",
    version: 1,
    exportedAt: new Date().toISOString(),
    recent: state.recent,
    favoriteArtists: state.favoriteArtists,
    songs,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `lyrica-library-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Exported ${plural(songs.length, "song")}`);
}
async function importLibrary(file) {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("That file is too large to be a Lyrica backup.");
  const { records, withheld, recent, favoriteArtists } = parseBackup(await file.text(), {
    allowContent: state.settings.cache,
  });
  for (const record of records) {
    const existing = await db.getSong(record.id);
    await db.putSong(
      existing
        ? {
            ...existing,
            favorite: existing.favorite || record.favorite,
            viewed: Math.max(existing.viewed || 0, record.viewed),
            document: existing.document || record.document,
            translations: { ...record.translations, ...existing.translations },
          }
        : record,
    );
  }
  state.recent = [...new Set([...state.recent, ...recent])].slice(0, 8);
  await db.setPreference("recent", state.recent);
  for (const name of favoriteArtists)
    if (!hasArtist(state.favoriteArtists, name))
      state.favoriteArtists = toggleArtist(state.favoriteArtists, name);
  await db.setPreference("favoriteArtists", state.favoriteArtists);
  await refreshSongs();
  render();
  toast(
    `Imported ${plural(records.length, "song")}.${withheld ? " Lyrics weren’t imported because offline storage is off." : ""}`,
  );
}

document.addEventListener("click", async (event) => {
  const nav = event.target.closest('a[href^="#"]');
  if (
    nav &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.button === 0 &&
    ["#search", "#library", "#settings"].includes(nav.getAttribute("href")) &&
    location.hash === nav.getAttribute("href")
  ) {
    event.preventDefault();
    await navigate(true).catch((error) => toast(error.message));
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  try {
    if (action === "demo") await openSong(demo.song);
    if (action === "open-result") {
      await remember(state.query);
      await openSong(state.results[Number(button.dataset.index)]);
    }
    if (action === "open-library") {
      const saved = state.songs.find(
        (song) => song.id === button.dataset.index,
      );
      await openSong(saved.song, saved);
    }
    if (action === "back") {
      if (history.state?.lyrica) history.back();
      else location.replace(`#${readerOrigin}`);
    }
    if (
      action === "filter-artist" ||
      action === "library-artist" ||
      action === "favorite-artist" ||
      action === "artist-search"
    ) {
      const name = button.dataset.artist || "";
      if (action === "filter-artist") {
        state.artistFilter = sameArtist(state.artistFilter, name) ? "" : name;
        updateSearchRegion();
        document
          .querySelector(`#search-results [data-action="filter-artist"][aria-pressed="true"]`)
          ?.focus({ preventScroll: true });
      }
      if (action === "library-artist") {
        state.libraryArtist = sameArtist(state.libraryArtist, name) ? "" : name;
        document.querySelector("#library-artists").innerHTML = libraryArtists();
        document.querySelector("#library-records").innerHTML = libraryRecords();
      }
      if (action === "favorite-artist") {
        state.favoriteArtists = toggleArtist(state.favoriteArtists, name);
        await db.setPreference("favoriteArtists", state.favoriteArtists);
        if (state.page === "library")
          document.querySelector("#library-artists").innerHTML = libraryArtists();
        else updateSearchRegion();
        toast(
          hasArtist(state.favoriteArtists, name)
            ? `${name} added to favorite artists`
            : `${name} removed from favorite artists`,
        );
      }
      if (action === "artist-search") {
        state.query = name;
        state.artistSearch = true;
        if (state.page === "search") {
          render();
          await search();
        } else {
          pendingSearch = true;
          location.hash = "#search";
        }
      }
    }
    if (action === "recent") {
      state.artistSearch = false;
      state.query = state.recent[Number(button.dataset.index)];
      render();
      await search();
    }
    if (action === "retry-search") await search();
    if (action === "retry-lyrics") await loadLyrics();
    if (action === "cancel-translation") {
      translationController?.abort();
      revision++;
      state.translating = false;
      state.lines = [];
      state.message = "Translation stopped. You can retry when you’re ready.";
      render();
    }
    if (action === "retranslate") await prepare(false, true);
    if (action === "translate") await prepare(true, true);
    if (action === "choose-source") {
      const select = document.querySelector("#source-language");
      select?.focus();
      try {
        select?.showPicker?.();
      } catch {
        /* Focus alone is enough where pickers can't open programmatically. */
      }
    }
    if (action === "favorites" || action === "history") {
      state.favorites = action === "favorites";
      render();
    }
    if (action === "highlight") {
      // Selecting text (to copy a phrase) shouldn't also toggle the highlight.
      const selection = getSelection();
      if (!selection.isCollapsed && button.contains(selection.anchorNode))
        return;
      toggleRow(button);
    }
    if (action === "layout") {
      state.stacked = !state.stacked;
      render();
    }
    if (action === "study") {
      state.settings.study = !state.settings.study;
      state.revealed = new Set();
      await saveSettings();
      render();
    }
    if (action === "smaller" || action === "larger") {
      state.settings.font = Math.max(
        15,
        Math.min(30, state.settings.font + (action === "larger" ? 1 : -1)),
      );
      await saveSettings();
      render();
    }
    if (action === "favorite") {
      state.reader.favorite = !state.reader.favorite;
      await persist();
      render();
      if (state.reader.favorite)
        document.querySelector(".favorite-button")?.classList.add("pop");
      // Offer offline storage once; afterwards a favorite is simply a bookmark.
      if (
        state.reader.favorite &&
        !state.settings.cache &&
        !state.settings.offeredCache
      ) {
        state.settings.offeredCache = true;
        await saveSettings();
        permission();
      } else
        toast(
          state.reader.favorite ? "Added to favorites" : "Removed from favorites",
        );
    }
    if (action === "share") {
      const url = songLink();
      const { title, artist } = state.reader.song;
      if (navigator.share) {
        try {
          await navigator.share({ title, text: `${title} · ${artist}`, url });
        } catch (error) {
          if (error.name !== "AbortError") await copy(url, "Link copied");
        }
      } else await copy(url, "Link copied");
    }
    if (action === "copy-link") await copy(songLink(), "Link copied");
    if (action === "copy-lyrics")
      await copy(lyricsText(), "Lyrics and translation copied");
    if (action === "close-dialog") requestDialogClose();
    if (action === "discard-draft") dialog.close();
    if (action === "unfavorite") {
      const record = state.songs.find((song) => song.id === button.dataset.id);
      if (!record) return;
      const items = [...main.querySelectorAll(".library-item")];
      const position = items.indexOf(button.closest(".library-item"));
      await db.putSong({ ...record, favorite: false });
      await refreshSongs();
      document.querySelector("#library-records").innerHTML = libraryRecords();
      const next = main.querySelectorAll(".library-item .song-row")[
        Math.max(0, position - 1)
      ];
      (next || main.querySelector(".segmented .selected"))?.focus();
      toast(`Removed “${record.song.title}” from favorites`, {
        label: "Undo",
        run: async () => {
          await db.putSong({ ...record, favorite: true });
          await refreshSongs();
          if (state.page === "library") render();
        },
      });
    }
    if (action === "remove")
      showDialog(
        "Remove this song?",
        "This removes its bookmark, original lyrics, and translations from this browser.",
        "Remove",
        async () => {
          await db.removeSong(button.dataset.id);
          await refreshSongs();
          render();
        },
        { confirmLabel: "Remove song" },
      );
    if (action === "clear-recent") {
      state.recent = [];
      await db.setPreference("recent", []);
      render();
      toast("Recent searches cleared");
    }
    if (action === "keep-models") {
      let granted = false;
      try {
        granted = Boolean(await navigator.storage?.persist?.());
      } catch {
        /* Falls through to the explanation below. */
      }
      await refreshModels();
      render();
      toast(
        granted
          ? "Your browser will keep downloaded languages"
          : "The browser declined. Adding Lyrica to your Home Screen (or using it more often) helps.",
      );
    }
    if (action === "export-library") await exportLibrary();
    if (action === "import-library") document.querySelector("#import-file")?.click();
    if (action === "clear-models")
      showDialog(
        "Remove downloaded models?",
        "Language models and the shared engine will be removed from this browser. Saved translations stay in your library. A new download is needed to translate more songs.",
        "Remove models",
        async () => {
          await clearTranslationModels();
          toast("Downloaded models removed.");
        },
        { confirmLabel: "Remove models" },
      );
    if (action === "clear-cache" || action === "delete-all")
      showDialog(
        action === "clear-cache"
          ? "Clear saved lyrics?"
          : "Delete library and history?",
        action === "clear-cache"
          ? "Original lyrics and translations will be removed. Favorite bookmarks remain."
          : "All songs, favorites, cached content, and search history will be removed. This cannot be undone. Export a backup first if you might want them later.",
        "Clear",
        async () => {
          if (action === "clear-cache") await db.clearContent();
          else {
            await db.clearSongs();
            state.recent = [];
            state.favoriteArtists = [];
            await db.setPreference("recent", []);
            await db.setPreference("favoriteArtists", []);
          }
          await refreshSongs();
          state.reader = null;
          render();
        },
        {
          confirmLabel:
            action === "clear-cache" ? "Clear content" : "Delete library",
        },
      );
    if (action === "manual-original") {
      const reader = state.reader;
      showDialog(
        "Paste original lyrics",
        "Paste lyrics you’re permitted to use. Keep the original line breaks and blank lines between verses.",
        "Use lyrics",
        async (text) => {
          const cleaned = cleanLyrics(text);
          if (!cleaned) throw new Error("Paste some lyrics first.");
          lyricsController?.abort();
          reader.loading = false;
          reader.document = { text: cleaned, source: "manual" };
          reader.translations = {};
          state.selected = -1;
          state.lines = [];
          state.message = "";
          await persist();
          // Show the new lyrics immediately; translation status follows.
          render();
          await prepare();
        },
        { textarea: "Original lyrics", confirmLabel: "Use lyrics" },
      );
      document.querySelector("#manual-text").value =
        reader.document?.text || "";
    }
    if (action === "manual-translation") {
      const reader = state.reader;
      const lineCount = reader.document.text.split("\n").filter(Boolean).length;
      showDialog(
        "Paste a translation",
        `Paste a ${languages[state.target]} translation with ${plural(lineCount, "line")}, one for each original line. Blank verse breaks will be preserved.`,
        "Use translation",
        async (text) => {
          const lines = alignTranslation(reader.document.text, text);
          translationController?.abort();
          revision++;
          state.translating = false;
          state.lines = lines;
          delete reader.translations[
            translationKey(state.source, state.target, "context")
          ];
          delete reader.translations[
            translationKey(state.source, state.target, "lines")
          ];
          reader.translations[`${state.source}:${state.target}`] = lines;
          state.grouped = false;
          state.message = "Translation supplied by you.";
          await persist();
          render();
        },
        {
          textarea: "Translated lyrics",
          confirmLabel: "Use translation",
          originalText: reader.document.text,
        },
      );
    }
  } catch (error) {
    toast(error.message);
  }
});

/* Keyboard ---------------------------------------------------------------- */

document.addEventListener("keydown", (event) => {
  const target = document.activeElement;
  const modified = event.ctrlKey || event.metaKey || event.altKey;
  if (
    event.key === "/" &&
    !modified &&
    !dialog.open &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  ) {
    const input = document.querySelector("#song-search");
    if (input) {
      event.preventDefault();
      input.focus();
    }
  }
  // Lyric rows: one Tab stop, arrow keys move the highlighted line.
  const row = target?.closest?.(".lyric-row");
  if (row && !dialog.open) {
    if ((event.key === " " || event.key === "Enter") && !modified) {
      event.preventDefault();
      toggleRow(row);
      return;
    }
    const rows = lyricRows();
    const index = rows.indexOf(row);
    const next = {
      ArrowDown: rows[index + 1],
      j: rows[index + 1],
      ArrowUp: rows[index - 1],
      k: rows[index - 1],
      Home: rows[0],
      End: rows.at(-1),
    }[event.key];
    if (!modified && event.key in { ArrowDown: 1, ArrowUp: 1, j: 1, k: 1, Home: 1, End: 1 }) {
      event.preventDefault();
      if (next) focusRow(next);
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "c" &&
      getSelection().isCollapsed
    ) {
      event.preventDefault();
      copy(pairText(row), "Line copied");
      return;
    }
  }
  // Search results: arrow keys move between the field and recordings.
  if (!modified && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    const results = [...main.querySelectorAll('[data-action="open-result"]')];
    if (target?.id === "song-search" && event.key === "ArrowDown" && results[0]) {
      event.preventDefault();
      results[0].focus();
    } else if (results.includes(target)) {
      event.preventDefault();
      const position = results.indexOf(target) + (event.key === "ArrowDown" ? 1 : -1);
      (results[position] || (position < 0 ? document.querySelector("#song-search") : null))?.focus();
    }
  }
  if (event.key === "Escape") {
    const menu = document.querySelector(".reader-options");
    if (menu?.open) {
      const focusInside = menu.contains(target);
      menu.open = false;
      if (focusInside)
        menu.querySelector("summary").focus({ preventScroll: true });
    } else if (row && state.selected >= 0) {
      const previous = state.selected;
      state.selected = -1;
      refreshRow(previous);
    }
  }
});
document.addEventListener("click", (event) => {
  const menu = document.querySelector(".reader-options");
  if (menu && !menu.contains(event.target)) menu.open = false;
});

/* Start --------------------------------------------------------------------- */

async function boot() {
  try {
    state.settings = {
      ...state.settings,
      ...(await db.preference("settings")),
    };
    state.settings.translationStyle =
      state.settings.translationStyle === "lines" ? "lines" : "context";
    state.settings.font = Math.max(
      15,
      Math.min(30, Number(state.settings.font) || 21),
    );
    state.recent = (await db.preference("recent")) || [];
    state.favoriteArtists = (await db.preference("favoriteArtists")) || [];
    applySettings();
    if (!db.storage.persistent)
      toast(
        "This browser is blocking storage. Lyrica works, but your library lasts only until you close this tab.",
      );
    await route(false);
  } catch (error) {
    render();
    toast(error.message);
  }
}
boot();
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("./sw.js").catch(() => {
    /* Reader still works when installation is unavailable. */
  });
