// Staff phones through the HTTP app (B51): added with Add staff, changed by staff.changePhone on a fresh session with
// staff:manage, shown on the list, and refused for anyone else.
import type { StaffMember } from "@travel-crm/contracts/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("staff phones", () => {
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

  it("adds staff with a phone typed the Indian way, shows it on the list and changes it", async () => {
    const ravi = await dataOf<StaffMember>(
      await mutate(
        server,
        "staff.create",
        {
          name: "Ravi",
          username: "ravi",
          roleKey: "sales",
          temporaryPassword: "ravi-temp-pass-1",
          phone: "98765 01234",
        },
        owner,
      ),
    );
    expect(ravi.phone).toBe("+919876501234");
    const changed = await dataOf<StaffMember>(
      await mutate(server, "staff.changePhone", { memberId: ravi.memberId, phone: "+91 98111 22233" }, owner),
    );
    expect(changed.phone).toBe("+919811122233");
    const listed = await dataOf<StaffMember[]>(await query(server, "staff.list", owner));
    expect(listed.find((member) => member.memberId === ravi.memberId)?.phone).toBe("+919811122233");
    const cleared = await dataOf<StaffMember>(
      await mutate(server, "staff.changePhone", { memberId: ravi.memberId, phone: null }, owner),
    );
    expect(cleared.phone).toBeNull();
  });

  it("refuses a bad phone, and a change from someone without staff:manage", async () => {
    const person = await addStaff(server, agency, { username: "phone-target", roleKey: "sales" });
    expect((await mutate(server, "staff.changePhone", { memberId: person.memberId, phone: "12" }, owner)).status).toBe(
      400,
    );
    const sales = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "sunil", roleKey: "sales" }),
    );
    expect(
      await refusalOf(await mutate(server, "staff.changePhone", { memberId: person.memberId, phone: null }, sales)),
    ).toEqual({ status: 403, reason: "MISSING_PERMISSION" });
  });
});
