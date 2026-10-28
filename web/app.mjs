import {
  languages,
  rtl,
  escapeHTML as e,
  cleanLyrics,
  alignTranslation,
  storageRecord,
  demo,
} from "./core.mjs";
import { searchSongs, fetchLyrics } from "./services.mjs";
import * as db from "./store.mjs";
import {
  detectLanguage,
  translationStatus,
  translateLines,
} from "./translation.mjs";
const main = document.querySelector("main");
const dialog = document.querySelector("dialog");
const state = {
  page: "search",
  query: "",
  results: [],
  searched: false,
  busy: false,
  error: "",
  songs: [],
  recent: [],
  reader: null,
  libraryQuery: "",
  favorites: false,
  settings: { target: "en", font: 21, theme: "system", cache: false },
  source: "",
  target: "en",
  lines: [],
  message: "",
  translating: false,
  selected: -1,
  stacked: false,
};
let searchController,
  lyricsController,
  translationController,
  debounce,
  toastTimer,
  readerOrigin = "search",
  revision = 0;
const options = (selected) =>
  Object.entries(languages)
    .map(
      ([code, name]) =>
        `<option value="${code}" ${code === selected ? "selected" : ""}>${name}</option>`,
    )
    .join("");
function toast(message) {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("visible"), 5000);
}
function applySettings() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.style.setProperty(
    "--lyrics-size",
    `${state.settings.font}px`,
  );
}
async function saveSettings() {
  applySettings();
  await db.setPreference("settings", state.settings);
}
async function refreshSongs() {
  state.songs = (await db.allSongs()).sort((a, b) => b.viewed - a.viewed);
  document.querySelector("#library-count").textContent = state.songs.filter(
    (song) => song.favorite,
  ).length;
}
function cover(song, className = "") {
  return song.artworkURL?.startsWith("https://")
    ? `<img class="cover ${className}" src="${e(song.artworkURL)}" alt="" loading="lazy">`
    : `<div class="cover demo-cover ${className}" aria-hidden="true"></div>`;
}
function songRow(song, index, action = "open-result", offline = false) {
  const minutes = `${Math.floor(song.duration / 60)}:${String(Math.floor(song.duration % 60)).padStart(2, "0")}`;
  return `<button class="song-row" data-action="${action}" data-index="${index}">${cover(song)}<span class="song-info"><strong>${e(song.title)}</strong><span>${e(song.artist)}</span><small>${e(song.album)}</small></span><span class="song-duration">${offline ? "↓ Saved" : song.duration ? minutes : "Demo"}</span><span aria-hidden="true">↗</span></button>`;
}
function render() {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const active =
      link.dataset.nav ===
      (state.page === "reader" ? readerOrigin : state.page);
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
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
}
function searchView() {
  return `${!state.query ? `<section class="welcome"><div><span class="eyebrow">LYRICS, WITHOUT BORDERS</span><h1>Find the words.<br><em>Feel the meaning.</em></h1><p class="intro">The songs you love have more to say.<br>Discover their words, in your language.</p></div><div class="demo-art"><small>A LITTLE WINDOW INTO LYRICA</small><div class="sun"></div><blockquote>“Si las palabras<br>son un puente…”</blockquote><button data-action="demo">Open the bilingual demo &nbsp; ↗</button></div></section>` : ""}<section class="search-area"><form id="search-form" role="search"><div class="search-box"><span class="search-icon" aria-hidden="true">⌕</span><input type="search" id="song-search" aria-label="Search songs or paste an Apple Music link" placeholder="Song, artist, album, or Apple Music link" value="${e(state.query)}" autocomplete="off" spellcheck="false"><button class="search-submit" type="submit" aria-label="Search">Search <span aria-hidden="true">↗</span></button></div></form><div class="search-help"><span>Apple Music links welcome. No playback required.</span><span>Free, from the very first word.</span></div>${!state.query && state.recent.length ? `<div class="recent"><span>Recent</span>${state.recent.map((query, index) => `<button class="chip" data-action="recent" data-index="${index}">${e(query)}</button>`).join("")}<button class="plain" data-action="clear-recent">Clear</button></div>` : ""}<div id="search-results" aria-live="polite">${searchResults()}</div></section>${!state.query ? `<section class="steps"><div><span>01</span>Find your song<p>Search the music you love, or bring an Apple Music link.</p></div><div><span>02</span>Choose a language<p>Translate on your device in supported browsers.</p></div><div><span>03</span>Read between the lines<p>Keep the original and its meaning together.</p></div></section>` : ""}`;
}
function searchResults() {
  if (state.busy)
    return '<div class="notice"><span class="spinner"></span>Finding your song…</div>';
  if (state.error)
    return `<div class="notice">${e(state.error)} <button class="plain" data-action="retry-search">Try again</button></div>`;
  if (!state.searched) return "";
  return `<div class="section-heading"><h2>Choose your recording</h2><span>${state.results.length} results</span></div>${state.results.length ? state.results.map((song, i) => songRow(song, i)).join("") : '<div class="empty">No songs found. Try a different title or artist.</div>'}<p class="search-help">Check the album and duration for remixes, live versions, and re-recordings.</p>`;
}
function libraryView() {
  const records = state.songs.filter(
    (record) =>
      (!state.favorites || record.favorite) &&
      (!state.libraryQuery ||
        `${record.song.title} ${record.song.artist} ${record.song.album}`
          .toLowerCase()
          .includes(state.libraryQuery.toLowerCase())),
  );
  return `<div class="page-head"><span class="eyebrow">YOUR PERSONAL COLLECTION</span><h1 class="page-title">Words worth keeping.</h1><p>Your favorites and recently viewed songs, all in one quiet place.</p></div><div class="library-tools"><div class="segmented"><button data-action="history" class="${!state.favorites ? "selected" : ""}">Recently viewed</button><button data-action="favorites" class="${state.favorites ? "selected" : ""}">Favorites</button></div><input class="library-search" id="library-search" aria-label="Search your library" placeholder="Search your library" value="${e(state.libraryQuery)}"></div><div id="library-records">${records.length ? records.map((record) => `<div class="library-item">${songRow(record.song, record.id, "open-library", Boolean(record.document))}<button class="icon-button danger" data-action="remove" data-id="${e(record.id)}" aria-label="Remove ${e(record.song.title)}">×</button></div>`).join("") : '<div class="empty">Your collection starts with a song. Discover one, or try the original bilingual demo.<br><button class="plain" data-action="demo">Open demo ↗</button></div>'}</div><p class="search-help">↓ Saved means original lyrics are available offline. Translated languages are saved only when permitted caching is enabled.</p>`;
}
function readerView() {
  const reader = state.reader;
  if (!reader) return "";
  const source = state.source || reader.document?.language || "";
  return `<div class="reader-top"><button class="plain" data-action="back">← Back to ${readerOrigin === "library" ? "library" : "discover"}</button><div class="reader-actions"><button class="icon-button" data-action="smaller" aria-label="Smaller lyrics">A−</button><button class="icon-button" data-action="larger" aria-label="Larger lyrics">A+</button><button class="icon-button" data-action="layout" aria-label="Switch between columns and stacked layout" aria-pressed="${state.stacked}">☷</button><button class="icon-button" data-action="favorite" aria-label="${reader.favorite ? "Remove from favorites" : "Save favorite"}" aria-pressed="${Boolean(reader.favorite)}">${reader.favorite ? "♥" : "♡"}</button></div></div><header class="reader-song">${cover(reader.song)}<div><h1>${e(reader.song.title)}</h1><p>${e(reader.song.artist)}<br>${e(reader.song.album)}</p></div></header><div class="language-bar"><div class="language-control"><label for="source-language">Original language</label><select id="source-language"><option value="" ${!source ? "selected" : ""}>Detect / choose language</option>${options(source)}</select></div><span aria-hidden="true">→</span><div class="language-control"><label for="target-language">Translate into</label><select id="target-language">${options(state.target)}</select></div><span class="on-device">ON YOUR DEVICE</span></div><div id="translation-status" role="status">${translationNotice()}</div>${
    reader.document
      ? `<section class="${state.stacked ? "stacked" : ""}" aria-label="Bilingual lyrics"><div class="lyric-columns"><span>Original · ${e(languages[source] || "Auto")}</span><span>${e(languages[state.target] || state.target)}</span></div><div id="lyric-lines">${reader.document.text
          .split("\n")
          .map((line, index) =>
            line
              ? `<button class="lyric-row" data-action="highlight" data-index="${index}" aria-pressed="${state.selected === index}"><span lang="${e(source || "und")}" dir="${rtl(source) ? "rtl" : "auto"}">${e(line)}</span><span class="translated" lang="${e(state.target)}" dir="${rtl(state.target) ? "rtl" : "auto"}">${e(state.lines[index] || "—")}</span></button>`
              : '<div class="verse-space" aria-hidden="true"></div>',
          )
          .join("")}</div></section>`
      : ""
  }<div class="lyric-foot">${reader.song.demo ? "Original demo lyrics and example translations by Lyrica Studio. This is fictional demo material, not a commercial recording." : reader.document?.source === "lrclib" ? 'Lyrics provided by <a href="https://lrclib.net" target="_blank" rel="noopener">LRCLIB</a>. Rights belong to their respective owners.' : "Lyrics supplied by you. Only use material you’re permitted to read and retain."}<br>Machine translations may miss poetry, idioms, or context. ${reader.song.appleMusicURL?.startsWith("https://") ? `<a href="${e(reader.song.appleMusicURL)}" target="_blank" rel="noopener">View in Apple Music ↗</a>` : ""}<br><button class="plain" data-action="manual-original">Paste or replace original lyrics</button> &nbsp; <button class="plain" data-action="manual-translation" ${!reader.document ? "disabled" : ""}>Paste a translation</button></div>`;
}
function translationNotice() {
  if (state.reader?.loading)
    return '<div class="notice"><span class="spinner"></span>Finding the words…</div>';
  if (!state.message) return "";
  return `<div class="notice">${state.translating ? '<span class="spinner"></span>' : ""}${e(state.message)}${!state.translating && state.reader?.document && !state.lines.length ? '<button class="plain" data-action="translate">Translate on this device</button><button class="plain" data-action="manual-translation">Paste translation</button>' : ""}${!state.reader?.document ? '<button class="plain" data-action="retry-lyrics">Retry</button><button class="plain" data-action="manual-original">Paste lyrics</button>' : ""}</div>`;
}
function settingsView() {
  return `<div class="page-head"><span class="eyebrow">A READER THAT FEELS LIKE YOU</span><h1 class="page-title">Make yourself at home.</h1><p>A few thoughtful choices. Everything else gets out of the way.</p></div><div class="settings-grid"><section class="setting-section"><h2>Reading</h2><div class="setting-row"><label for="default-language">Default translation language</label><select id="default-language">${options(state.settings.target)}</select></div><div class="setting-row"><label for="theme">Appearance</label><select id="theme">${["system", "light", "dark"].map((value) => `<option value="${value}" ${value === state.settings.theme ? "selected" : ""}>${value[0].toUpperCase() + value.slice(1)}</option>`).join("")}</select></div><div class="setting-row"><label for="font-size">Lyrics text size <small id="font-value">${state.settings.font}px</small></label><input id="font-size" type="range" min="15" max="30" value="${state.settings.font}"></div></section><section class="setting-section"><h2>On this browser</h2><div class="setting-row"><label for="cache">Save permitted lyrics offline<p>Lyrics and translations stay in this browser. Enable only for material you’re permitted to keep.</p></label><input id="cache" type="checkbox" ${state.settings.cache ? "checked" : ""}></div><p>${state.songs.filter((song) => song.document).length} originals saved · ${state.songs.filter((song) => song.favorite).length} favorites. Browser data is separate from your iPhone library.</p><div class="storage-buttons"><button class="plain" data-action="clear-cache">Clear lyrics & translations</button><button class="plain" data-action="clear-recent">Clear recent searches</button><button class="plain danger" data-action="delete-all">Delete library & history</button></div></section><section class="setting-section"><h2>Free. And honest about the details.</h2><p>Search and metadata come from Apple’s iTunes API. Lyrics come from LRCLIB. Availability does not grant copyright or redistribution rights. Only paste or store material you’re authorized to use.</p><p>Automatic web translation uses the browser’s on-device Translator API where available (supported desktop Chrome versions, compatible hardware and language pairs). It may need a free model download and a manual source-language selection. Safari, Firefox, and many mobile browsers don’t provide this API; paste translations or explore the original bilingual demo there. Apple Translation is exclusive to the native iPhone app.</p><p>Queries go directly to Apple, and recording metadata goes directly to LRCLIB. Lyrica has no analytics, accounts, server, paid API, or cloud sync. Only the application shell is cached automatically; lyric storage is opt-in. Clearing browser data removes your library. Browser-managed translation models are managed by the browser.</p><a class="plain" href="https://github.com/Kerollosl/lyrica" target="_blank" rel="noopener">Explore the iPhone app and source ↗</a></section></div>`;
}
async function search() {
  searchController?.abort();
  searchController = new AbortController();
  const controller = searchController;
  state.query =
    document.querySelector("#song-search")?.value.trim() ?? state.query;
  state.results = [];
  state.error = "";
  state.searched = false;
  if (!state.query) {
    state.busy = false;
    render();
    return;
  }
  state.busy = true;
  render();
  // Restore focus after replacing the search region, retaining a smooth typing flow.
  const input = document.querySelector("#song-search");
  input?.focus();
  input?.setSelectionRange(input.value.length, input.value.length);
  try {
    const results = await searchSongs(state.query, controller.signal);
    if (controller.signal.aborted) return;
    state.results = results;
    state.searched = true;
  } catch (error) {
    if (controller.signal.aborted) return;
    state.error = error.message;
  } finally {
    if (!controller.signal.aborted) {
      state.busy = false;
      if (state.page === "search")
        document.querySelector("#search-results").innerHTML = searchResults();
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
async function persist() {
  if (!state.reader) return;
  await db.putSong(
    storageRecord(state.reader, state.reader.favorite, state.settings.cache),
  );
  await refreshSongs();
}
async function openSong(song, saved) {
  lyricsController?.abort();
  translationController?.abort();
  revision++;
  readerOrigin = state.page === "library" ? "library" : "search";
  state.page = "reader";
  state.source = "";
  state.target = state.settings.target;
  state.lines = [];
  state.message = "";
  state.selected = -1;
  const existing = saved || (await db.getSong(song.id));
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
  window.scrollTo(0, 0);
  await persist();
  if (state.reader.document) await prepare();
  else await loadLyrics();
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
async function prepare(userGesture = false) {
  translationController?.abort();
  const controller = new AbortController();
  translationController = controller;
  const token = ++revision;
  state.lines = [];
  state.translating = false;
  state.message = "";
  const reader = state.reader;
  if (!reader?.document) return;
  try {
    if (!state.source) {
      const detected =
        reader.document.language ||
        (await detectLanguage(reader.document.text)) ||
        "";
      if (token !== revision) return;
      state.source = detected;
    }
    if (token !== revision) return;
    const key = `${state.source}:${state.target}`;
    if (reader.translations[key]) {
      state.lines = reader.translations[key];
      state.message = reader.song.demo
        ? "Original demo · Example translations are included so you can try the reader in any browser."
        : "Saved translation · Available offline.";
      render();
      return;
    }
    const status = await translationStatus(state.source, state.target);
    if (token !== revision) return;
    if (status === "same") {
      state.lines = reader.document.text.split("\n");
      state.message = "The original is already in this language.";
    } else if (status === "missing")
      state.message =
        "This browser doesn’t offer on-device translation. Use supported desktop Chrome, paste a translation, or try the bilingual demo.";
    else if (status === "source-needed")
      state.message =
        "Choose the original language above to translate on this device.";
    else if (status === "unavailable")
      state.message =
        "This language pair isn’t supported on this device. Choose another language or paste a translation.";
    else if (status !== "available" && !userGesture)
      state.message =
        "A free language-model download is needed. Select “Translate on this device” to begin.";
    else {
      state.translating = true;
      state.message = "Translating privately on your device…";
      render();
      const lines = await translateLines(
        reader.document.text,
        state.source,
        state.target,
        {
          signal: controller.signal,
          progress(message) {
            if (token === revision) {
              state.message = message;
              const el = document.querySelector("#translation-status");
              if (el) el.innerHTML = translationNotice();
            }
          },
        },
      );
      if (token !== revision) return;
      state.lines = lines;
      reader.translations[key] = lines;
      state.message = "Translated on your device.";
      await persist();
    }
  } catch (error) {
    if (token !== revision || controller.signal.aborted) return;
    state.message = `Translation couldn’t finish. ${error.message} Try again or paste a translation.`;
  } finally {
    if (token === revision) {
      state.translating = false;
      if (state.page === "reader") render();
    }
  }
}
function showDialog(
  title,
  body,
  confirm,
  onConfirm,
  { textarea = "", confirmLabel = "Continue" } = {},
) {
  dialog.innerHTML = `<form id="dialog-form"><h2 id="dialog-title">${e(title)}</h2><p>${e(body)}</p>${textarea ? `<label class="eyebrow" for="manual-text">${e(textarea)}</label><textarea id="manual-text" spellcheck="false"></textarea>` : ""}<p class="error" role="alert"></p><div class="dialog-actions"><button type="button" class="plain" data-action="close-dialog">Cancel</button><button type="submit" class="primary">${e(confirmLabel || confirm)}</button></div></form>`;
  dialog.setAttribute("aria-labelledby", "dialog-title");
  dialog.showModal();
  document.querySelector("#dialog-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      await onConfirm(document.querySelector("#manual-text")?.value);
      dialog.close();
    } catch (error) {
      dialog.querySelector(".error").textContent = error.message;
    }
  };
}
function permission(onConfirm) {
  showDialog(
    "Keep the words with you?",
    "Enable offline storage only for lyrics and translations you’re permitted to keep. They stay in this browser. Favorite bookmarks work without storing lyrics.",
    "Enable",
    async () => {
      state.settings.cache = true;
      await saveSettings();
      await onConfirm?.();
      await persist();
      render();
    },
    { confirmLabel: "Enable permitted offline storage" },
  );
}
async function navigate() {
  translationController?.abort();
  lyricsController?.abort();
  searchController?.abort();
  clearTimeout(debounce);
  revision++;
  state.translating = false;
  state.busy = false;
  state.page = ["library", "settings"].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : "search";
  await refreshSongs();
  render();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", () =>
  navigate().catch((error) => toast(error.message)),
);
document.addEventListener("submit", (event) => {
  if (event.target.id === "search-form") {
    event.preventDefault();
    clearTimeout(debounce);
    search().catch((error) => toast(error.message));
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "song-search") {
    state.query = event.target.value;
    searchController?.abort();
    clearTimeout(debounce);
    debounce = setTimeout(
      () => search().catch((error) => toast(error.message)),
      450,
    );
  }
  if (event.target.id === "library-search") {
    state.libraryQuery = event.target.value;
    const start = event.target.selectionStart;
    render();
    const input = document.querySelector("#library-search");
    input.focus();
    input.setSelectionRange(start, start);
  }
  if (event.target.id === "font-size") {
    state.settings.font = Number(event.target.value);
    document.querySelector("#font-value").textContent =
      `${state.settings.font}px`;
    saveSettings().catch((error) => toast(error.message));
  }
});
document.addEventListener("change", async (event) => {
  try {
    const id = event.target.id,
      value = event.target.value;
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
    if (id === "cache") {
      if (event.target.checked) {
        event.target.checked = false;
        permission();
      } else {
        await db.clearContent();
        state.settings.cache = false;
        await saveSettings();
        await refreshSongs();
        render();
      }
    }
  } catch (error) {
    toast(error.message);
  }
});
document.addEventListener("click", async (event) => {
  const nav = event.target.closest('a[href^="#"]');
  if (
    nav &&
    ["#search", "#library", "#settings"].includes(nav.getAttribute("href")) &&
    location.hash === nav.getAttribute("href")
  ) {
    event.preventDefault();
    await navigate().catch((error) => toast(error.message));
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
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
      state.page = readerOrigin;
      translationController?.abort();
      lyricsController?.abort();
      revision++;
      render();
    }
    if (action === "recent") {
      state.query = state.recent[Number(button.dataset.index)];
      render();
      await search();
    }
    if (action === "retry-search") await search();
    if (action === "retry-lyrics") await loadLyrics();
    if (action === "translate") await prepare(true);
    if (action === "favorites" || action === "history") {
      state.favorites = action === "favorites";
      render();
    }
    if (action === "highlight") {
      state.selected =
        Number(button.dataset.index) === state.selected
          ? -1
          : Number(button.dataset.index);
      document
        .querySelectorAll(".lyric-row")
        .forEach((row) =>
          row.setAttribute(
            "aria-pressed",
            Number(row.dataset.index) === state.selected,
          ),
        );
    }
    if (action === "layout") {
      state.stacked = !state.stacked;
      render();
    }
    if (action === "smaller" || action === "larger") {
      state.settings.font = Math.max(
        15,
        Math.min(30, state.settings.font + (action === "larger" ? 1 : -1)),
      );
      await saveSettings();
    }
    if (action === "favorite") {
      state.reader.favorite = !state.reader.favorite;
      await persist();
      render();
      if (state.reader.favorite && !state.settings.cache) permission();
      else
        toast(
          state.reader.favorite
            ? "Saved to favorites"
            : "Removed from favorites",
        );
    }
    if (action === "close-dialog") dialog.close();
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
    if (action === "clear-cache" || action === "delete-all")
      showDialog(
        action === "clear-cache"
          ? "Clear saved lyrics?"
          : "Delete library and history?",
        action === "clear-cache"
          ? "Original lyrics and translations will be removed. Favorite bookmarks remain."
          : "All songs, favorites, cached content, and search history will be removed. This cannot be undone.",
        "Clear",
        async () => {
          if (action === "clear-cache") await db.clearContent();
          else {
            await db.clearSongs();
            state.recent = [];
            await db.setPreference("recent", []);
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
        "Bring your own words",
        "Paste lyrics you’re permitted to use. Keep the original line breaks and blank lines between verses.",
        "Use lyrics",
        async (text) => {
          const cleaned = cleanLyrics(text);
          if (!cleaned) throw new Error("Paste some lyrics first.");
          lyricsController?.abort();
          reader.loading = false;
          reader.document = { text: cleaned, source: "manual" };
          reader.translations = {};
          await persist();
          await prepare();
        },
        { textarea: "Original lyrics", confirmLabel: "Use lyrics" },
      );
      document.querySelector("#manual-text").value =
        reader.document?.text || "";
    }
    if (action === "manual-translation") {
      const reader = state.reader;
      showDialog(
        "A meaning of your own",
        `Paste a ${languages[state.target]} translation, one line per original line. Blank verse breaks will be preserved.`,
        "Use translation",
        async (text) => {
          const lines = alignTranslation(reader.document.text, text);
          translationController?.abort();
          revision++;
          state.translating = false;
          state.lines = lines;
          reader.translations[`${state.source}:${state.target}`] = lines;
          state.message = "Translation supplied by you.";
          await persist();
          render();
        },
        { textarea: "Translated lyrics", confirmLabel: "Use translation" },
      );
    }
  } catch (error) {
    toast(error.message);
  }
});
async function boot() {
  try {
    state.settings = {
      ...state.settings,
      ...(await db.preference("settings")),
    };
    state.settings.font = Math.max(
      15,
      Math.min(30, Number(state.settings.font) || 21),
    );
    state.recent = (await db.preference("recent")) || [];
    applySettings();
    await navigate();
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
