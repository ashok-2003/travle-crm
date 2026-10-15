// Platform staff's contracts: a newcomer is a name, a real address and a level; a change names one person by id; and
// unknown keys are refused, so nothing else (a password, a role string) can ride along.
import { describe, expect, it } from "vitest";
import {
  addPlatformStaffInput,
  platformStaffIdInput,
  platformStaffEntry,
  setPlatformStaffLevelInput,
} from "../../src/platform/index.js";

const userId = "0199e7a0-0000-7000-8000-0000000000d1";

describe("platform staff contracts", () => {
  it("adds a person by name, address (in lower case) and level, and nothing more", () => {
    expect(addPlatformStaffInput.parse({ name: " Ravi ", email: " Ravi@Example.TEST ", level: "support" })).toEqual({
      name: "Ravi",
      email: "ravi@example.test",
      level: "support",
    });
    expect(addPlatformStaffInput.safeParse({ name: "Ravi", email: "ravi@example.test", level: "admin" }).success).toBe(
      false,
    );
    expect(
      addPlatformStaffInput.safeParse({ name: "Ravi", email: "ravi@no-email.invalid", level: "support" }).success,
    ).toBe(false);
    expect(
      addPlatformStaffInput.safeParse({ name: "Ravi", email: "ravi@example.test", level: "support", password: "x" })
        .success,
    ).toBe(false);
  });

  it("changes one person, by id, to a level", () => {
    expect(setPlatformStaffLevelInput.parse({ userId, level: "super-admin" })).toEqual({
      userId,
      level: "super-admin",
    });
    expect(setPlatformStaffLevelInput.safeParse({ userId, level: null }).success).toBe(false);
    expect(platformStaffIdInput.safeParse({ userId: "ravi" }).success).toBe(false);
    expect(platformStaffIdInput.safeParse({ userId, level: "support" }).success).toBe(false);
  });

  it("lists removed people with no level, and when they were removed", () => {
    const removed = {
      userId,
      name: "Ravi",
      email: "ravi@example.test",
      level: null,
      mustChangePassword: false,
      twoFactorEnabled: false,
      createdAt: "2026-10-16T03:30:00.000Z",
      removedAt: "2026-10-17T03:30:00.000Z",
    };
    expect(platformStaffEntry.parse(removed)).toEqual(removed);
  });
});
