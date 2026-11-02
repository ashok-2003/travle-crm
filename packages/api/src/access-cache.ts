// A small in-process cache for what every organization request reads first: a member's access and the subscription's
// stored facts. It holds them for a few minutes; the app clears an organization's entries after any change made
// through the api, and the subscription's state is still computed from the facts with the clock on every call.
import { pendingStep, type MemberAccess } from "@travel-crm/domain/identity";
import type { SubscriptionFacts } from "@travel-crm/domain/subscriptions";

export const ACCESS_CACHE_TTL_MS = 5 * 60_000;
export const ACCESS_CACHE_MAX_ENTRIES = 5_000;

export interface MemberKey {
  userId: string;
  organizationId: string;
  impersonatedBy: string | null;
}

interface LoadOptions {
  /** Read from the database whatever is kept, and keep the result. */
  fresh?: boolean;
}

export interface AccessCache {
  member(key: MemberKey, load: () => Promise<MemberAccess | null>, options?: LoadOptions): Promise<MemberAccess | null>;
  subscription(
    organizationId: string,
    load: () => Promise<SubscriptionFacts | null>,
    options?: LoadOptions,
  ): Promise<SubscriptionFacts | null>;
  /** Drops that organization's members and its subscription. */
  forgetOrganization(organizationId: string): void;
}

interface Entry<Value> {
  organizationId: string;
  value: Value;
  expiresAt: number;
}

/** One kind of entry: a map whose insertion order is the least-recently-used order, and the loads in flight. */
class Store<Value> {
  private readonly entries = new Map<string, Entry<Value>>();
  private readonly inFlight = new Map<string, Promise<Value | null>>();
  private generation = 0;

  constructor(
    private readonly options: { ttlMs: number; maxEntries: number; now: () => number },
    private readonly keepable: (value: Value) => boolean,
  ) {}

  get(
    key: string,
    organizationId: string,
    load: () => Promise<Value | null>,
    fresh: boolean | undefined,
  ): Promise<Value | null> {
    if (!fresh) {
      const hit = this.entries.get(key);
      if (hit && hit.expiresAt >= this.options.now()) {
        this.entries.delete(key);
        this.entries.set(key, hit);
        return Promise.resolve(hit.value);
      }
      const pending = this.inFlight.get(key);
      if (pending) return pending;
    }
    const startedIn = this.generation;
    const loading = load().then((value) => {
      // A change made while this was loading may have made it stale: hand it back, but do not keep it.
      if (value !== null && this.keepable(value) && startedIn === this.generation)
        this.keep(key, organizationId, value);
      else if (fresh) this.entries.delete(key);
      return value;
    });
    const tracked = loading.finally(() => {
      if (this.inFlight.get(key) === tracked) this.inFlight.delete(key);
    });
    this.inFlight.set(key, tracked);
    return tracked;
  }

  forget(organizationId: string): void {
    this.generation += 1;
    for (const [key, entry] of this.entries) if (entry.organizationId === organizationId) this.entries.delete(key);
    this.inFlight.clear();
  }

  private keep(key: string, organizationId: string, value: Value): void {
    this.entries.delete(key);
    this.entries.set(key, { organizationId, value, expiresAt: this.options.now() + this.options.ttlMs });
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}

export function createAccessCache(options: { ttlMs: number; maxEntries: number; now?: () => number }): AccessCache {
  if (options.ttlMs <= 0) return noAccessCache;
  const settings = { ttlMs: options.ttlMs, maxEntries: options.maxEntries, now: options.now ?? Date.now };
  // A member with a step still to take is never kept: the step ends the moment they take it.
  const members = new Store<MemberAccess>(settings, (access) => pendingStep(access) === null);
  const subscriptions = new Store<SubscriptionFacts>(settings, () => true);
  return {
    member: (key, load, loadOptions) =>
      members.get(
        `${key.organizationId}|${key.userId}|${key.impersonatedBy ?? ""}`,
        key.organizationId,
        load,
        loadOptions?.fresh,
      ),
    subscription: (organizationId, load, loadOptions) =>
      subscriptions.get(organizationId, organizationId, load, loadOptions?.fresh),
    forgetOrganization: (organizationId) => {
      members.forget(organizationId);
      subscriptions.forget(organizationId);
    },
  };
}

/** ttlMs 0: every call loads. The default for tests and for any caller that passes no cache. */
export const noAccessCache: AccessCache = {
  member: (_key, load) => load(),
  subscription: (_organizationId, load) => load(),
  forgetOrganization: () => undefined,
};
