// Names for the people a page mentions (R13): asked of identity once per page, each id once, and none for an empty
// page; an id identity doesn't name (a former member) is left out, for the screens to show as such.
import type { Identity, MemberContact } from "@travel-crm/domain/identity";
import { describe, expect, it } from "vitest";
import { memberNames } from "../src/member-names.js";

const asha = "0199e7a0-0000-7000-8000-0000000000a1";
const ravi = "0199e7a0-0000-7000-8000-0000000000a2";
const gone = "0199e7a0-0000-7000-8000-0000000000a3";

function identityNaming(contacts: MemberContact[]) {
  const asked: string[][] = [];
  const identity = {
    memberContacts: (_organizationId: string, userIds: readonly string[]) => {
      asked.push([...userIds]);
      return Promise.resolve(contacts.filter((contact) => userIds.includes(contact.userId)));
    },
  } as unknown as Identity;
  return { identity, asked };
}

describe("memberNames", () => {
  it("names the members a page mentions, once each, leaving out former members and nobody", async () => {
    const { identity, asked } = identityNaming([
      { userId: asha, name: "Asha", email: null },
      { userId: ravi, name: "Ravi", email: "ravi@example.in" },
    ]);
    expect(await memberNames(identity, "organization", [asha, null, ravi, asha, gone, undefined])).toEqual({
      [asha]: "Asha",
      [ravi]: "Ravi",
    });
    expect(asked).toEqual([[asha, ravi, gone]]);
    expect(await memberNames(identity, "organization", [null])).toEqual({});
    expect(asked).toHaveLength(1);
  });
});
