// Trip details and Discard: who may do what. Setting a trip up (create, change, delete, its files) is the Owner's and Admins'
// (inbox:templates); sending it to a chat, like discarding a message that was not sent, needs inbox:reply; reading the list
// needs only inbox:view. A member holding every other permission is refused before the handler runs.
import {
  PermissionSet,
  permissions,
  type Identity,
  type MemberAccess,
  type Permission,
} from "@travel-crm/domain/identity";
import { lifecycleAccessOf } from "@travel-crm/domain/subscriptions";
import { describe, expect, it } from "vitest";
import type { Context } from "../src/context.js";
import { appRouter } from "../src/routers/app-router.js";
import { t } from "../src/trpc.js";
import { outcome } from "./request-probe.js";

const procedures = Object.keys(appRouter._def.procedures as unknown as Record<string, unknown>);

const curated: Record<string, Permission> = {
  "tripKits.create": "inbox:templates",
  "tripKits.update": "inbox:templates",
  "tripKits.delete": "inbox:templates",
  "tripKits.requestUpload": "inbox:templates",
  "tripKits.confirmUpload": "inbox:templates",
  "tripKits.removeFile": "inbox:templates",
  "tripKits.send": "inbox:reply",
  "tripKits.list": "inbox:view",
  "inbox.discard": "inbox:reply",
  "inbox.media": "inbox:view",
};

/** A caller of the app router for a member holding every permission but one, on a plan with every module. */
function callerWithout(missing: Permission[]) {
  const member: MemberAccess = {
    organizationId: "0199e7a0-0000-7000-8000-0000000000d1",
    userId: "0199e7a0-0000-7000-8000-0000000000d2",
    memberId: "0199e7a0-0000-7000-8000-0000000000d3",
    source: "web",
    impersonatedBy: null,
    role: { key: "custom", name: "Custom", isOwner: false },
    permissions: PermissionSet.of(
      permissions
        .filter((permission) => !missing.includes(permission))
        .map((permission) => ({ permission, scope: "all" })),
    ),
    mustChangePassword: false,
    twoFactorEnabled: false,
    organizationRequiresTwoFactor: false,
  };
  const session = { activeOrganizationId: member.organizationId, impersonatedBy: null };
  const ctx = {
    identity: {
      resolveAccess: () => Promise.resolve(member),
      recordActivity: () => Promise.resolve(),
    } as unknown as Identity,
    subscriptions: {
      entitlementsOf: () =>
        Promise.resolve({
          status: "active",
          access: lifecycleAccessOf("active"),
          planName: "Everything",
          modules: new Set(["crm", "inbox"]),
          limits: { seats: 5, whatsappNumbers: 1, storageBytes: 1 },
          trialEndsOn: null,
          paidThrough: null,
          nextChangeOn: null,
        }),
    },
    headers: new Headers(),
    resHeaders: new Headers(),
    session,
    user: { id: member.userId },
  } as unknown as Context;
  return t.createCallerFactory(appRouter)(ctx) as unknown as Record<
    string,
    Record<string, (input?: unknown) => Promise<string>>
  >;
}

describe("trip details and discard", () => {
  it("name every trip procedure, so a new one has to be given a permission here", () => {
    const tripKits = procedures.filter((path) => path.startsWith("tripKits."));
    expect(tripKits.sort()).toEqual(
      Object.keys(curated)
        .filter((path) => path.startsWith("tripKits."))
        .sort(),
    );
  });

  it("refuse each one without its permission, before its handler runs", async () => {
    for (const [path, permission] of Object.entries(curated)) {
      const [router = "", name = ""] = path.split(".");
      const call = callerWithout([permission])[router]?.[name];
      expect(call, path).toBeDefined();
      if (call) expect(await outcome(call()), path).toBe("MISSING_PERMISSION");
    }
  });

  it("keep trip setup out of a member who may only reply, and discard out of one who may only read", async () => {
    // Everything but the templates permission: sending still passes the check, setting up does not.
    const withoutTemplates = callerWithout(["inbox:templates"]);
    expect(await outcome(withoutTemplates.tripKits?.create?.() ?? Promise.resolve("missing"))).toBe(
      "MISSING_PERMISSION",
    );
    expect(await outcome(withoutTemplates.tripKits?.send?.() ?? Promise.resolve("missing"))).not.toBe(
      "MISSING_PERMISSION",
    );
    const withoutReply = callerWithout(["inbox:reply"]);
    expect(await outcome(withoutReply.inbox?.discard?.() ?? Promise.resolve("missing"))).toBe("MISSING_PERMISSION");
  });
});
