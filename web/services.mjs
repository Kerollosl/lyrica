import {
  appleReference,
  recordScore,
  documentFrom,
  matchRecording,
} from "./core.mjs";
const nextRequest = new Map();
const abortError = () => new DOMException("Request cancelled", "AbortError");
async function pace(host, interval, signal) {
  while (true) {
    if (signal?.aborted) throw abortError();
    const delay = (nextRequest.get(host) || 0) - Date.now();
    if (delay <= 0) {
      nextRequest.set(host, Date.now() + interval);
      return;
    }
    await new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError());
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, delay);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
async function get(url, signal) {
  const host = new URL(url).hostname;
  for (let attempt = 0; attempt < 2; attempt++) {
    await pace(host, host === "itunes.apple.com" ? 3100 : 400, signal);
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal?.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(
      () =>
        controller.abort(
          new DOMException("The request timed out. Try again.", "TimeoutError"),
        ),
      20000,
    );
    try {
      if (signal?.aborted) throw abortError();
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.status === 429)
        throw new Error(
          "The service is busy. Wait a minute before trying again.",
        );
      if (response.status === 404) return null;
      if (response.status >= 500 && attempt === 0) continue;
      if (!response.ok)
        throw new Error(
          "The service is temporarily unavailable. Try again shortly.",
        );
      return await response.json();
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (controller.signal.aborted)
        throw new Error("The request timed out. Try again.");
      if (error instanceof TypeError)
        throw new Error(
          "Couldn’t connect. Check your connection, or open a saved song in Library.",
        );
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  }
}
function songFrom(track) {
  return {
    id: track.trackId,
    title: track.trackName,
    artist: track.artistName,
    album: track.collectionName || "",
    duration: (track.trackTimeMillis || 0) / 1000,
    artworkURL: track.artworkUrl100?.replace("100x100bb", "600x600bb"),
    appleMusicURL: track.trackViewUrl,
  };
}
export async function searchSongs(query, signal) {
  const link = /^https?:\/\//i.test(query);
  const reference = link ? appleReference(query) : null;
  const params = new URLSearchParams(
    reference
      ? { id: reference.id, country: reference.country, entity: "song" }
      : {
          term: query,
          entity: "song",
          media: "music",
          limit: 40,
          country: "US",
        },
  );
  const data = await get(
    `https://itunes.apple.com/${reference ? "lookup" : "search"}?${params}`,
    signal,
  );
  const songs = [
    ...new Map(
      (data?.results || [])
        .filter((track) => track.kind === "song")
        .map((track) => [track.trackId, songFrom(track)]),
    ).values(),
  ];
  if (reference && !songs.length)
    throw new Error(
      "This song isn’t available in that storefront. Try searching by title and artist.",
    );
  return songs;
}
export async function fetchLyrics(song, signal) {
  const params = new URLSearchParams({
    track_name: song.title,
    artist_name: song.artist,
    album_name: song.album,
  });
  if (song.duration) params.set("duration", Math.round(song.duration));
  const exact = await get(`https://lrclib.net/api/get?${params}`, signal);
  if (exact && recordScore(exact, song) !== null) {
    try {
      return documentFrom(exact);
    } catch (error) {
      if (exact.instrumental) throw error;
    }
  }
  params.delete("album_name");
  params.delete("duration");
  const records = await get(`https://lrclib.net/api/search?${params}`, signal);
  return matchRecording(records || [], song);
}
