let connection;
// When IndexedDB can't open (some private modes and strict privacy settings),
// Lyrica keeps working for the session with the same API in memory.
let memory = null;
export const storage = { persistent: true };

function openDatabase() {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open("lyrica-web", 1);
    } catch {
      reject(Object.assign(new Error("unavailable"), { fallback: true }));
      return;
    }
    request.onupgradeneeded = () => {
      request.result.createObjectStore("songs", { keyPath: "id" });
      request.result.createObjectStore("preferences");
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        connection = null;
      };
      resolve(request.result);
    };
    request.onerror = () =>
      reject(Object.assign(new Error("unavailable"), { fallback: true }));
    request.onblocked = () =>
      reject(new Error("Close other Lyrica tabs and try again."));
  });
}

export async function database() {
  if (memory) return null;
  if (connection) return connection;
  try {
    connection = await openDatabase();
    return connection;
  } catch (error) {
    if (!error.fallback) throw error;
    memory = { songs: new Map(), preferences: new Map() };
    storage.persistent = false;
    return null;
  }
}

const copy = (value) =>
  value === undefined ? undefined : structuredClone(value);

async function operation(store, mode, callback, fallback) {
  const db = await database();
  if (!db) return fallback(memory);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = callback(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () =>
      reject(
        new Error(
          "Couldn’t save local data. Your browser’s storage may be full.",
        ),
      );
    transaction.onabort = () =>
      reject(new Error("Local data could not be updated. Try again."));
  });
}
export const getSong = (id) =>
  operation(
    "songs",
    "readonly",
    (store) => store.get(String(id)),
    (m) => copy(m.songs.get(String(id))),
  );
export const allSongs = () =>
  operation(
    "songs",
    "readonly",
    (store) => store.getAll(),
    (m) => [...m.songs.values()].map(copy),
  );
export const putSong = (record) =>
  operation(
    "songs",
    "readwrite",
    (store) => store.put(record),
    (m) => void m.songs.set(String(record.id), copy(record)),
  );
export const removeSong = (id) =>
  operation(
    "songs",
    "readwrite",
    (store) => store.delete(String(id)),
    (m) => void m.songs.delete(String(id)),
  );
export const clearSongs = () =>
  operation(
    "songs",
    "readwrite",
    (store) => store.clear(),
    (m) => m.songs.clear(),
  );
export const preference = (key) =>
  operation(
    "preferences",
    "readonly",
    (store) => store.get(key),
    (m) => copy(m.preferences.get(key)),
  );
export const setPreference = (key, value) =>
  operation(
    "preferences",
    "readwrite",
    (store) => store.put(value, key),
    (m) => void m.preferences.set(key, copy(value)),
  );
export async function clearContent() {
  const db = await database();
  if (!db) {
    for (const [id, item] of memory.songs)
      memory.songs.set(id, { ...item, document: null, translations: {} });
    return;
  }
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("songs", "readwrite");
    const store = transaction.objectStore("songs");
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (item) {
        item.update({ ...item.value, document: null, translations: {} });
        item.continue();
      }
    };
    transaction.oncomplete = resolve;
    transaction.onerror = () =>
      reject(new Error("Couldn’t clear cached content."));
  });
}
