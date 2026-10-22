// The opened token (W37): signed under a key derived from the auth secret; a young, old, forged or other form's token is
// refused with its own reason.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkOpenedToken, formTokenKey, signOpenedToken } from "../../src/website-forms/index.js";

const secret = "an-auth-secret-of-at-least-thirty-two-bytes";
const key = formTokenKey(secret);
const formId = randomUUID();
const openedAt = new Date("2026-10-22T10:00:00.000Z");
const later = (milliseconds: number) => new Date(openedAt.getTime() + milliseconds);
const reasonOf = (work: () => void) => {
  try {
    work();
  } catch (error) {
    return (error as { reason?: string }).reason;
  }
  return "accepted";
};

describe("the opened token", () => {
  it("is signed under a key derived from the auth secret, not the secret itself", () => {
    expect(key.equals(Buffer.from(secret))).toBe(false);
    expect(formTokenKey(secret).equals(key)).toBe(true);
    expect(formTokenKey("another-auth-secret-of-at-least-32-bytes").equals(key)).toBe(false);
    const token = signOpenedToken(key, formId, openedAt);
    expect(token).not.toContain(secret);
    expect(
      reasonOf(() => {
        checkOpenedToken(formTokenKey("another-auth-secret-of-at-least-32-bytes"), token, formId, later(5000));
      }),
    ).toBe("FORM_EXPIRED");
  });

  it("accepts a token from two seconds to 24 hours old", () => {
    const token = signOpenedToken(key, formId, openedAt);
    expect(
      reasonOf(() => {
        checkOpenedToken(key, token, formId, later(2000));
      }),
    ).toBe("accepted");
    expect(
      reasonOf(() => {
        checkOpenedToken(key, token, formId, later(24 * 3_600_000));
      }),
    ).toBe("accepted");
  });

  it("under two seconds is FORM_TOO_FAST", () => {
    const token = signOpenedToken(key, formId, openedAt);
    expect(
      reasonOf(() => {
        checkOpenedToken(key, token, formId, later(1999));
      }),
    ).toBe("FORM_TOO_FAST");
    expect(
      reasonOf(() => {
        checkOpenedToken(key, token, formId, later(0));
      }),
    ).toBe("FORM_TOO_FAST");
    expect(
      reasonOf(() => {
        checkOpenedToken(key, token, formId, later(-5000));
      }),
    ).toBe("FORM_TOO_FAST");
  });

  it("older than 24 hours is FORM_EXPIRED", () => {
    const token = signOpenedToken(key, formId, openedAt);
    expect(
      reasonOf(() => {
        checkOpenedToken(key, token, formId, later(24 * 3_600_000 + 1));
      }),
    ).toBe("FORM_EXPIRED");
  });

  it("another form's token is refused", () => {
    const token = signOpenedToken(key, randomUUID(), openedAt);
    expect(
      reasonOf(() => {
        checkOpenedToken(key, token, formId, later(5000));
      }),
    ).toBe("FORM_EXPIRED");
  });

  it("a tampered or unreadable token is refused", () => {
    const token = signOpenedToken(key, formId, openedAt);
    const [id, milliseconds, mac] = token.split(".") as [string, string, string];
    const forgeries = [
      `${id}.${String(Number(milliseconds) + 10_000)}.${mac}`,
      `${id}.${milliseconds}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`,
      `${id}.${milliseconds}.`,
      `${id}.${milliseconds}`,
      `${token}.extra`,
      "",
      "garbage",
    ];
    for (const forged of forgeries) {
      expect(
        reasonOf(() => {
          checkOpenedToken(key, forged, formId, later(5000));
        }),
        forged,
      ).toBe("FORM_EXPIRED");
    }
  });
});
