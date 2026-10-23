// The SecretBox seals a secret to its context and opens it only with the right context and a known key.
import { describe, expect, it } from "vitest";
import {
  createAesSecretBox,
  createMemorySecretBox,
  generateSecretBoxKey,
  SecretBoxError,
} from "../../src/secret-box/index.js";

describe("the AES SecretBox", () => {
  const key = generateSecretBoxKey();

  it("opens what it sealed, with a fresh nonce each time", () => {
    const box = createAesSecretBox([key]);
    const first = box.seal("EAAB-token", "page-1:org-1");
    const second = box.seal("EAAB-token", "page-1:org-1");
    expect(box.open(first, "page-1:org-1")).toBe("EAAB-token");
    expect(Buffer.from(first.nonce).equals(Buffer.from(second.nonce))).toBe(false);
    expect(Buffer.from(first.ciphertext).includes(Buffer.from("EAAB-token"))).toBe(false);
  });

  it("refuses a ciphertext copied to another row (the context is authenticated)", () => {
    const box = createAesSecretBox([key]);
    const sealed = box.seal("EAAB-token", "page-1:org-1");
    expect(() => box.open(sealed, "page-2:org-1")).toThrow(SecretBoxError);
    expect(() => box.open(sealed, "page-1:org-2")).toThrow(SecretBoxError);
  });

  it("refuses an altered ciphertext, a short one, and another key", () => {
    const box = createAesSecretBox([key]);
    const sealed = box.seal("EAAB-token", "ctx");
    const altered = Uint8Array.from(sealed.ciphertext);
    altered[0] = (altered[0] ?? 0) ^ 1;
    expect(() => box.open({ ...sealed, ciphertext: altered }, "ctx")).toThrow(SecretBoxError);
    expect(() => box.open({ ...sealed, ciphertext: new Uint8Array(3) }, "ctx")).toThrow(SecretBoxError);
    expect(() => createAesSecretBox([generateSecretBoxKey()]).open(sealed, "ctx")).toThrow(SecretBoxError);
  });

  it("seals with the newest key and still opens what an older key sealed (rotation)", () => {
    const older = generateSecretBoxKey();
    const newer = generateSecretBoxKey();
    const sealedOld = createAesSecretBox([older]).seal("old", "ctx");
    const rotated = createAesSecretBox([newer, older]);
    expect(rotated.open(sealedOld, "ctx")).toBe("old");
    const sealedNew = rotated.seal("new", "ctx");
    expect(sealedNew.keyVersion).not.toBe(sealedOld.keyVersion);
    expect(createAesSecretBox([newer]).open(sealedNew, "ctx")).toBe("new");
    expect(() => createAesSecretBox([older]).open(sealedNew, "ctx")).toThrow(SecretBoxError);
  });

  it("refuses a malformed or missing key without printing it", () => {
    expect(() => createAesSecretBox([])).toThrow(SecretBoxError);
    const bad = "c2hvcnQ=";
    try {
      createAesSecretBox([bad]);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SecretBoxError);
      expect(String(error)).not.toContain(bad);
    }
  });

  it("has an in-memory box that behaves the same", () => {
    const box = createMemorySecretBox();
    expect(box.open(box.seal("secret", "a"), "a")).toBe("secret");
    expect(() => box.open(box.seal("secret", "a"), "b")).toThrow(SecretBoxError);
  });
});
