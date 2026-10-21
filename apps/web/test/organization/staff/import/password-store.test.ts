// The staff import's passwords live in this tab's memory only (B46, B48): kept per import, added to for B50's new ones,
// forgotten on leaving.
import { afterEach, describe, expect, it } from "vitest";
import { passwordStore } from "@/organization/staff/import/password-store";

describe("the password store", () => {
  afterEach(() => {
    passwordStore.forget("one");
    passwordStore.forget("two");
  });

  it("keeps an import's passwords by row, apart from another import's, and forgets them", () => {
    passwordStore.keep("one", new Map([[2, "alpha"]]));
    passwordStore.keep("two", new Map([[2, "beta"]]));
    expect(passwordStore.get("one")?.get(2)).toBe("alpha");
    expect(passwordStore.get("two")?.get(2)).toBe("beta");
    passwordStore.forget("one");
    expect(passwordStore.get("one")).toBeUndefined();
    expect(passwordStore.get("two")?.get(2)).toBe("beta");
  });

  it("adds new passwords to those kept, and replaces a row's", () => {
    passwordStore.keep("one", new Map([[2, "alpha"]]));
    passwordStore.add(
      "one",
      new Map([
        [3, "gamma"],
        [2, "delta"],
      ]),
    );
    expect([...(passwordStore.get("one") ?? [])]).toEqual([
      [2, "delta"],
      [3, "gamma"],
    ]);
  });

  it("does not let the map it was given change what it kept", () => {
    const given = new Map([[2, "alpha"]]);
    passwordStore.keep("one", given);
    given.set(2, "changed");
    expect(passwordStore.get("one")?.get(2)).toBe("alpha");
  });
});
