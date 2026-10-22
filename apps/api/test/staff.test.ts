// Staff management through the HTTP app (spec 6.3): an owner adds people with and without email, changes their
// roles, resets passwords and removes them, and nobody reaches above their own access.
import type { MeOutput, StaffMember } from "@travel-crm/contracts/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import {
  betterAuthLines,
  createTestAgency,
  createTestServer,
  signInByEmail,
  signInWithCode,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("staff management", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
  });

  afterAll(async () => {
    await server.close();
  });

  it("adds staff without email, who sign in with the organization code and must choose a password", async () => {
    const ravi = await dataOf<StaffMember>(
      await mutate(
        server,
        "staff.create",
        { name: "Ravi Kumar", username: "Ravi", roleKey: "sales", temporaryPassword: "ravi-temp-pass-1" },
        owner,
      ),
    );
    expect(ravi).toMatchObject({
      email: null,
      username: "Ravi",
      role: { key: "sales", name: "Sales" },
      mustChangePassword: true,
    });
    const jar = new CookieJar();
    expect(
      (await signInWithCode(server, jar, { orgCode: agency.code, username: "ravi", password: "ravi-temp-pass-1" }))
        .status,
    ).toBe(200);
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).pendingStep).toBe("CHANGE_PASSWORD");
  });

  it("adds staff with email, who sign in by email", async () => {
    const email = `meera-${agency.code.toLowerCase()}@example.test`;
    await dataOf(
      await mutate(
        server,
        "staff.create",
        {
          name: "Meera",
          email: ` ${email.toUpperCase()} `,
          roleKey: "operations",
          temporaryPassword: "meera-temp-pass-1",
        },
        owner,
      ),
    );
    expect((await signInByEmail(server, new CookieJar(), email, "meera-temp-pass-1")).status).toBe(200);
  });

  it("refuses staff with neither email nor username, or a placeholder address", async () => {
    const neither = await mutate(
      server,
      "staff.create",
      { name: "Nobody", roleKey: "sales", temporaryPassword: "nobody-pass-1" },
      owner,
    );
    expect(neither.status).toBe(400);
    const placeholder = await mutate(
      server,
      "staff.create",
      { name: "Sneaky", email: "x@no-email.invalid", roleKey: "sales", temporaryPassword: "sneaky-pass-1" },
      owner,
    );
    expect(placeholder.status).toBe(400);
  });

  it("refuses a username already in use in the organization", async () => {
    await dataOf(
      await mutate(
        server,
        "staff.create",
        { name: "Anil", username: "Anil", roleKey: "sales", temporaryPassword: "anil-temp-pass-1" },
        owner,
      ),
    );
    const again = await mutate(
      server,
      "staff.create",
      { name: "Another Anil", username: "ANIL", roleKey: "sales", temporaryPassword: "anil-temp-pass-2" },
      owner,
    );
    expect(await refusalOf(again)).toEqual({ status: 409, reason: "EMAIL_OR_USERNAME_TAKEN" });
  });

  it("lists the organization's staff, without placeholder addresses, to staff:manage only", async () => {
    const own = await createTestAgency(server);
    const ownOwner = await signedInOwner(server, own);
    await dataOf(
      await mutate(
        server,
        "staff.create",
        { name: "Ravi Kumar", username: "ravi", roleKey: "sales", temporaryPassword: "ravi-temp-pass-1" },
        ownOwner,
      ),
    );
    await dataOf(
      await mutate(
        server,
        "staff.create",
        {
          name: "Meera",
          email: `meera-${own.code.toLowerCase()}@example.test`,
          roleKey: "operations",
          temporaryPassword: "meera-temp-pass-1",
        },
        ownOwner,
      ),
    );
    const staff = await dataOf<StaffMember[]>(await query(server, "staff.list", ownOwner));
    expect(staff.map((member) => member.name)).toEqual(["Asha Owner", "Ravi Kumar", "Meera"]);
    expect(staff.find((member) => member.name === "Ravi Kumar")?.email).toBeNull();
    const sales = await signedInStaff(
      server,
      own,
      await addStaff(server, own, { username: "sunil", roleKey: "sales" }),
    );
    expect(await refusalOf(await query(server, "staff.list", sales))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
  });

  describe("an Admin", () => {
    let admin: CookieJar;

    beforeAll(async () => {
      admin = await signedInStaff(
        server,
        agency,
        await addStaff(server, agency, { username: "admin", roleKey: "org-admin" }),
      );
    });

    it("can manage staff but cannot make anyone an Owner", async () => {
      expect((await query(server, "staff.list", admin)).status).toBe(200);
      const boss = await mutate(
        server,
        "staff.create",
        { name: "Boss", username: "boss", roleKey: "org-owner", temporaryPassword: "boss-temp-pass-1" },
        admin,
      );
      expect(await refusalOf(boss)).toEqual({ status: 403, reason: "OWNER_ONLY" });
    });

    it("cannot take over the Owner's account by resetting its password", async () => {
      const reset = await mutate(
        server,
        "staff.resetPassword",
        { memberId: agency.owner.memberId, temporaryPassword: "hijacked-pass-1" },
        admin,
      );
      expect(await refusalOf(reset)).toEqual({ status: 403, reason: "OWNER_ONLY" });
      expect((await signInByEmail(server, new CookieJar(), agency.owner.email, agency.owner.password)).status).toBe(
        200,
      );
    });

    it("cannot remove the Owner, and the Owner cannot remove themselves", async () => {
      expect(await refusalOf(await mutate(server, "staff.remove", { memberId: agency.owner.memberId }, admin))).toEqual(
        { status: 403, reason: "OWNER_ONLY" },
      );
      expect(await refusalOf(await mutate(server, "staff.remove", { memberId: agency.owner.memberId }, owner))).toEqual(
        {
          status: 403,
          reason: "CANNOT_CHANGE_YOURSELF",
        },
      );
    });
  });

  it("moves someone to another role, effective on their next request", async () => {
    const tara = await addStaff(server, agency, { username: "tara", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, tara);
    expect(await refusalOf(await query(server, "staff.list", jar))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
    await dataOf(await mutate(server, "staff.updateRole", { memberId: tara.memberId, roleKey: "org-admin" }, owner));
    expect((await query(server, "staff.list", jar)).status).toBe(200);
  });

  it("takes access away from someone moved to a lesser role, on their next request", async () => {
    const uma = await addStaff(server, agency, { username: "uma", roleKey: "org-admin" });
    const jar = await signedInStaff(server, agency, uma);
    expect((await query(server, "staff.list", jar)).status).toBe(200);
    await dataOf(await mutate(server, "staff.updateRole", { memberId: uma.memberId, roleKey: "sales" }, owner));
    expect(await refusalOf(await query(server, "staff.list", jar))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
  });

  it("stops a banned member who still holds a session, on their next request", async () => {
    const vik = await addStaff(server, agency, { username: "vik", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, vik);
    expect((await query(server, "settings.get", jar)).status).toBe(200);
    await server.platform.user.update({ where: { id: vik.userId }, data: { banned: true } });
    expect(await refusalOf(await query(server, "settings.get", jar))).toEqual({ status: 403, reason: "NOT_A_MEMBER" });
    expect(await refusalOf(await query(server, "roles.list", jar))).toEqual({ status: 403, reason: "NOT_A_MEMBER" });
  });

  it("resets a password: the person is signed out everywhere and must choose a new one", async () => {
    server.logger.entries.length = 0;
    const kiran = await addStaff(server, agency, { username: "kiran", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, kiran);
    await dataOf(
      await mutate(
        server,
        "staff.resetPassword",
        { memberId: kiran.memberId, temporaryPassword: "kiran-new-temp-1" },
        owner,
      ),
    );
    expect((await query(server, "roles.list", jar)).status).toBe(401);
    expect(
      (
        await signInWithCode(server, new CookieJar(), {
          orgCode: agency.code,
          username: "kiran",
          password: kiran.password,
        })
      ).status,
    ).toBe(401);
    const again = new CookieJar();
    expect(
      (await signInWithCode(server, again, { orgCode: agency.code, username: "kiran", password: "kiran-new-temp-1" }))
        .status,
    ).toBe(200);
    expect(await refusalOf(await query(server, "settings.get", again))).toEqual({
      status: 403,
      reason: "CHANGE_PASSWORD",
    });
    expect(betterAuthLines(server, "warn")).toEqual(["Invalid password"]);
  });

  it("removes someone at once: no access on the next request, no sign-in, and their email is free again", async () => {
    server.logger.entries.length = 0;
    const email = `dev-${agency.code.toLowerCase()}@example.test`;
    const dev = await dataOf<StaffMember>(
      await mutate(
        server,
        "staff.create",
        { name: "Dev", email, username: "dev", roleKey: "sales", temporaryPassword: "dev-temp-pass-1" },
        owner,
      ),
    );
    await server.platform.user.update({ where: { id: dev.userId }, data: { mustChangePassword: false } });
    const jar = new CookieJar();
    await signInByEmail(server, jar, email, "dev-temp-pass-1");
    expect((await query(server, "settings.get", jar)).status).toBe(200);

    await dataOf(await mutate(server, "staff.remove", { memberId: dev.memberId }, owner));
    expect(await refusalOf(await query(server, "settings.get", jar))).toEqual({ status: 403, reason: "NOT_A_MEMBER" });
    expect((await query(server, "roles.list", jar)).status).toBe(401);
    expect((await signInByEmail(server, new CookieJar(), email, "dev-temp-pass-1")).status).toBe(401);
    // The released username signs nobody in either.
    expect(
      (
        await signInWithCode(server, new CookieJar(), {
          orgCode: agency.code,
          username: "dev",
          password: "dev-temp-pass-1",
        })
      ).status,
    ).toBe(401);
    expect(betterAuthLines(server, "warn")).toEqual(["User not found", "User not found"]);

    const other = await createTestAgency(server);
    const otherOwner = await signedInOwner(server, other);
    const rejoined = await mutate(
      server,
      "staff.create",
      { name: "Dev", email, roleKey: "sales", temporaryPassword: "dev-temp-pass-2" },
      otherOwner,
    );
    expect((await dataOf<StaffMember>(rejoined)).email).toBe(email);
  });

  it("treats a member of another organization as not found", async () => {
    const other = await createTestAgency(server);
    expect(await refusalOf(await mutate(server, "staff.remove", { memberId: other.owner.memberId }, owner))).toEqual({
      status: 404,
      reason: "MEMBER_NOT_FOUND",
    });
  });

  it("cannot reset the password or change the role of another organization's Owner", async () => {
    const other = await createTestAgency(server);
    const reset = await mutate(
      server,
      "staff.resetPassword",
      { memberId: other.owner.memberId, temporaryPassword: "hijacked-pass-2" },
      owner,
    );
    expect(await refusalOf(reset)).toEqual({ status: 404, reason: "MEMBER_NOT_FOUND" });
    const demote = await mutate(
      server,
      "staff.updateRole",
      { memberId: other.owner.memberId, roleKey: "sales" },
      owner,
    );
    expect(await refusalOf(demote)).toEqual({ status: 404, reason: "MEMBER_NOT_FOUND" });
    expect((await signInByEmail(server, new CookieJar(), other.owner.email, other.owner.password)).status).toBe(200);
  });

  it("stops a staff manager whose sessions were revoked, at once", async () => {
    const jar = await signedInOwner(server, agency);
    await server.platform.session.deleteMany({ where: { userId: agency.owner.userId } });
    expect((await query(server, "staff.list", jar)).status).toBe(401);
    owner = await signedInOwner(server, agency);
  });
});
