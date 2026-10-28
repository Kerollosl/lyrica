let connection;
export async function database() {
  if (connection) return connection;
  connection = await new Promise((resolve, reject) => {
    const request = indexedDB.open("lyrica-web", 1);
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
      reject(
        new Error(
          "Local storage is unavailable. Check your browser’s privacy settings.",
        ),
      );
    request.onblocked = () =>
      reject(new Error("Close other Lyrica tabs and try again."));
  });
  return connection;
}
async function operation(store, mode, callback) {
  const db = await database();
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
  operation("songs", "readonly", (store) => store.get(String(id)));
export const allSongs = () =>
  operation("songs", "readonly", (store) => store.getAll());
export const putSong = (record) =>
  operation("songs", "readwrite", (store) => store.put(record));
export const removeSong = (id) =>
  operation("songs", "readwrite", (store) => store.delete(String(id)));
export const clearSongs = () =>
  operation("songs", "readwrite", (store) => store.clear());
export const preference = (key) =>
  operation("preferences", "readonly", (store) => store.get(key));
export const setPreference = (key, value) =>
  operation("preferences", "readwrite", (store) => store.put(value, key));
export async function clearContent() {
  const db = await database();
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
