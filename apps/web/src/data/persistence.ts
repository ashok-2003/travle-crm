// The query cache's copy in IndexedDB (spec 11: for weak connections), so the last lists show at once, even offline.
// It holds one person's organization data, so it is saved only with whose it is (page-data.ts restores it only for
// them), and a copy saved before the device's last wipe is never read. Once a wipe starts, the page saves nothing
// more: every wipe ends in a full page load, so stopping loses nothing, and a save still waiting in the throttle can't
// write the data back after it was deleted.
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { DehydratedState, DehydrateOptions, QueryClient } from "@tanstack/react-query";
import { persistQueryClientSubscribe, type PersistedClient } from "@tanstack/react-query-persist-client";
import { clear, createStore, get, set, type UseStore } from "idb-keyval";
import { z } from "zod";
import type { CopyOwner } from "./owner";
import { QUERY_CACHE_MAX_AGE } from "./query-client";

const DATABASE = "travel-crm";
const STORE = "query-cache";
const KEY = "queries";
/** Changed by every wipe, so every copy saved before it is void. It holds no data. */
const GENERATION_KEY = "travel-crm.saved-copy-generation";

let store: UseStore | undefined;

/** The IndexedDB store, opened on first use: there is no IndexedDB while a page renders on the server. */
function cacheStore(): UseStore {
  store ??= createStore(DATABASE, STORE);
  return store;
}

/** localStorage can be blocked; copies then rely on the owner check alone. */
function currentGeneration(): string | null {
  try {
    return window.localStorage.getItem(GENERATION_KEY);
  } catch {
    return null;
  }
}

/**
 * What goes into the copy: queries that succeeded, unless a screen keeps one out with `meta: { persist: false }`, and
 * never a mutation. A mutation waiting offline holds its variables, a temporary password among them, and restored
 * after a reload it has no function to run anyway.
 */
export const dehydrateOptions: DehydrateOptions = {
  shouldDehydrateMutation: () => false,
  shouldDehydrateQuery: (query) => query.state.status === "success" && query.meta?.persist !== false,
};

const savedCopySchema = z.object({
  buster: z.string(),
  timestamp: z.number(),
  owner: z.object({ userId: z.string(), organizationId: z.string().nullable() }),
  generation: z.string().nullable(),
  clientState: z.custom<DehydratedState>((value) => value !== null && typeof value === "object"),
});

export type SavedCopy = PersistedClient & z.infer<typeof savedCopySchema>;

export interface QueryCopy {
  /** Saves the cache whenever it changes, at most once a second, as owner()'s; nothing while owner() is null. */
  startSaving(): void;
  /** The copy saved by this build within a day, after the device's last wipe. Any other is removed. */
  read(): Promise<SavedCopy | undefined>;
  remove(): Promise<void>;
  /** Saves nothing more, for the rest of the page's life. Resolves once a write already under way has landed. */
  stop(): Promise<void>;
}

const copies = new WeakMap<QueryClient, QueryCopy>();

/** The copy of queryClient's cache. buster is the build: a copy from another build is never read. */
export function createQueryCopy(
  queryClient: QueryClient,
  { owner, buster }: { owner: () => CopyOwner | null; buster: string },
): QueryCopy {
  const generation = currentGeneration();
  let stopped = false;
  let unsubscribe: (() => void) | undefined;
  let writing: Promise<void> = Promise.resolve();
  const persister = createAsyncStoragePersister({
    key: KEY,
    storage: {
      getItem: (key) => get<string>(key, cacheStore()),
      setItem: (key, value: string) => {
        // A save the throttle held back until after a wipe, or one from a tab that missed another tab's wipe.
        if (stopped || currentGeneration() !== generation) return Promise.resolve();
        writing = set(key, value, cacheStore());
        return writing;
      },
      removeItem: () => clear(cacheStore()),
    },
    // Write at most once a second, however busy the cache is.
    throttleTime: 1000,
  });

  const copy: QueryCopy = {
    startSaving() {
      if (stopped || unsubscribe) return;
      unsubscribe = persistQueryClientSubscribe({
        queryClient,
        buster,
        dehydrateOptions,
        persister: {
          ...persister,
          persistClient: (client) => {
            const savedFor = owner();
            if (stopped || savedFor === null) return;
            const saved: SavedCopy = { ...client, owner: savedFor, generation };
            return persister.persistClient(saved);
          },
        },
      });
    },
    async read() {
      let stored: unknown;
      try {
        stored = await persister.restoreClient();
      } catch {
        stored = undefined; // not JSON: removed below
      }
      const parsed = savedCopySchema.safeParse(stored);
      const usable =
        parsed.success &&
        parsed.data.buster === buster &&
        Date.now() - parsed.data.timestamp <= QUERY_CACHE_MAX_AGE &&
        parsed.data.generation === currentGeneration();
      if (usable) return parsed.data;
      await copy.remove();
      return undefined;
    },
    remove: () => clear(cacheStore()),
    async stop() {
      stopped = true;
      unsubscribe?.();
      unsubscribe = undefined;
      await writing.catch(() => undefined);
    },
  };
  copies.set(queryClient, copy);
  return copy;
}

/** Stops queryClient's copy saving, if it has one: the first step of every wipe. */
export async function stopSaving(queryClient: QueryClient): Promise<void> {
  await copies.get(queryClient)?.stop();
}

/** Removes every saved copy on the device, and voids any that another tab is still about to write. */
export async function deleteSavedCopies(): Promise<void> {
  try {
    window.localStorage.setItem(GENERATION_KEY, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  } catch {
    // Blocked storage: the copy below is still deleted, and restoring still checks whose a copy is.
  }
  // Every key in the store, not only the cache's, so nothing an older version saved is left either.
  await clear(cacheStore());
}

/** Whether a copy is saved. For tests. */
export async function hasPersistedQueries(): Promise<boolean> {
  return (await get(KEY, cacheStore())) !== undefined;
}
