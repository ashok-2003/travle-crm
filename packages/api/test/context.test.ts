// The tRPC context hands every procedure the api's dependencies: identity, subscriptions and profiles, and for the
// screens' routers the database, the files service and the web push key the browser subscribes with.
import { describe, expect, it, vi } from "vitest";
import { createContext, type ApiDependencies } from "../src/context.js";

describe("createContext", () => {
  it("passes the database, the files service and the push key on, beside who is signed in", async () => {
    const getSession = vi.fn(() => Promise.resolve({ headers: new Headers(), response: null }));
    const dependencies = {
      identity: { auth: { api: { getSession } } },
      subscriptions: {},
      profiles: {},
      db: { forOrg: vi.fn() },
      files: { createUpload: vi.fn() },
      pushPublicKey: "BPublicKeyOfThisEnvironment",
    } as unknown as ApiDependencies;
    const context = await createContext(dependencies, new Request("http://localhost/api/trpc/me.get"), new Headers());
    expect(context).toMatchObject({
      db: dependencies.db,
      files: dependencies.files,
      pushPublicKey: "BPublicKeyOfThisEnvironment",
      session: null,
      user: null,
    });
  });
});
