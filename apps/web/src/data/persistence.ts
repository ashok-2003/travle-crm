// The query cache's copy in IndexedDB (spec 11: for weak connections), so the last lists show at once, even offline.
// It holds organization data, so signing out wipes it, here and in every other tab of the app.
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { Persister } from "@tanstack/react-query-persist-client";
import { createStore, del, get, set, type UseStore } from "idb-keyval";

const DATABASE = "travel-crm";
const STORE = "query-cache";
const KEY = "queries";

let store: UseStore | undefined;

/** The IndexedDB store, opened on first use: there is no IndexedDB while a page renders on the server. */
function cacheStore(): UseStore {
  store ??= createStore(DATABASE, STORE);
  return store;
}

export function createQueryPersister(): Persister {
  return createAsyncStoragePersister({
    key: KEY,
    storage: {
      getItem: (key) => get<string>(key, cacheStore()),
      setItem: (key, value: string) => set(key, value, cacheStore()),
      removeItem: (key) => del(key, cacheStore()),
    },
    // Write at most once a second, however busy the cache is.
    throttleTime: 1000,
  });
}

/** Removes the saved copy. */
export async function deletePersistedQueries(): Promise<void> {
  await del(KEY, cacheStore());
}

/** Whether a saved copy exists, for tests and the sign-out check. */
export async function hasPersistedQueries(): Promise<boolean> {
  return (await get(KEY, cacheStore())) !== undefined;
}
