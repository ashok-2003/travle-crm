// The access cache keeps a member's access and an organization's subscription facts for five minutes (no database).
import type { MemberAccess } from "@travel-crm/domain/identity";
import type { SubscriptionFacts } from "@travel-crm/domain/subscriptions";
import { describe, expect, it, vi } from "vitest";
import { ACCESS_CACHE_TTL_MS, createAccessCache, noAccessCache, type MemberKey } from "../src/access-cache.js";

const key = (organizationId: string, userId = "u"): MemberKey => ({ userId, organizationId, impersonatedBy: null });
const access = (extra: Partial<MemberAccess> = {}) =>
  ({
    mustChangePassword: false,
    twoFactorEnabled: false,
    organizationRequiresTwoFactor: false,
    ...extra,
  }) as MemberAccess;
const facts = {} as SubscriptionFacts;

function setup(maxEntries = 100) {
  let time = 0;
  const cache = createAccessCache({ ttlMs: ACCESS_CACHE_TTL_MS, maxEntries, now: () => time });
  return { cache, advance: (ms: number) => (time += ms) };
}

describe("access cache", () => {
  it("serves a hit within five minutes and loads again after", async () => {
    const { cache, advance } = setup();
    const load = vi.fn(() => Promise.resolve(access()));
    await cache.member(key("a"), load);
    advance(ACCESS_CACHE_TTL_MS);
    await cache.member(key("a"), load);
    expect(load).toHaveBeenCalledTimes(1);
    advance(1);
    await cache.member(key("a"), load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("counts the five minutes from when the load resolved", async () => {
    const { cache, advance } = setup();
    const load = vi.fn(() => {
      advance(60_000);
      return Promise.resolve(access());
    });
    await cache.member(key("a"), load);
    advance(ACCESS_CACHE_TTL_MS);
    await cache.member(key("a"), load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shares one load between concurrent misses", async () => {
    const { cache } = setup();
    const load = vi.fn(() => Promise.resolve(access()));
    await Promise.all([cache.member(key("a"), load), cache.member(key("a"), load)]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not keep a rejected load", async () => {
    const { cache } = setup();
    const load = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(access());
    await expect(cache.member(key("a"), load)).rejects.toThrow("down");
    await cache.member(key("a"), load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not keep a null member or one with a step still to take", async () => {
    const { cache } = setup();
    const none = vi.fn(() => Promise.resolve(null));
    await cache.member(key("a"), none);
    await cache.member(key("a"), none);
    expect(none).toHaveBeenCalledTimes(2);
    const pending = vi.fn(() => Promise.resolve(access({ mustChangePassword: true })));
    await cache.member(key("b"), pending);
    await cache.member(key("b"), pending);
    expect(pending).toHaveBeenCalledTimes(2);
  });

  it("loads and replaces when asked for a fresh one", async () => {
    const { cache } = setup();
    const load = vi.fn(() => Promise.resolve(access()));
    await cache.member(key("a"), load);
    await cache.member(key("a"), load, { fresh: true });
    await cache.member(key("a"), load, { fresh: true });
    expect(load).toHaveBeenCalledTimes(3);
    await cache.member(key("a"), load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("keeps an impersonating admin's access apart from the member's own", async () => {
    const { cache } = setup();
    const load = vi.fn(() => Promise.resolve(access()));
    await cache.member(key("a"), load);
    await cache.member({ ...key("a"), impersonatedBy: "admin" }, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("caches subscription facts the same way, fresh included", async () => {
    const { cache } = setup();
    const load = vi.fn(() => Promise.resolve(facts));
    await cache.subscription("a", load);
    await cache.subscription("a", load);
    expect(load).toHaveBeenCalledTimes(1);
    await cache.subscription("a", load, { fresh: true });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("forgets one organization's members and subscription only", async () => {
    const { cache } = setup();
    const member = vi.fn(() => Promise.resolve(access()));
    const subscription = vi.fn(() => Promise.resolve(facts));
    for (const id of ["a", "b"]) {
      await cache.member(key(id), member);
      await cache.subscription(id, subscription);
    }
    cache.forgetOrganization("a");
    for (const id of ["a", "b"]) {
      await cache.member(key(id), member);
      await cache.subscription(id, subscription);
    }
    expect(member).toHaveBeenCalledTimes(3);
    expect(subscription).toHaveBeenCalledTimes(3);
  });

  it("drops the least recently used entry past its limit", async () => {
    const { cache } = setup(2);
    const load = vi.fn(() => Promise.resolve(access()));
    await cache.member(key("o", "x"), load);
    await cache.member(key("o", "y"), load);
    await cache.member(key("o", "x"), load);
    await cache.member(key("o", "z"), load);
    expect(load).toHaveBeenCalledTimes(3);
    await cache.member(key("o", "x"), load);
    expect(load).toHaveBeenCalledTimes(3);
    await cache.member(key("o", "y"), load);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("noAccessCache loads every time", async () => {
    const load = vi.fn(() => Promise.resolve(access()));
    await noAccessCache.member(key("a"), load);
    await noAccessCache.member(key("a"), load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
