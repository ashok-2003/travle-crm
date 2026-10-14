// Share-link tokens carry their organization in the clear and a random secret, of which only a hash is stored.
import { describe, expect, it } from "vitest";
import { newShareLinkToken, parseShareLinkToken } from "../../src/share-links/token.js";
import { truncateIpAddress } from "../../src/share-links/visitor.js";

const organizationId = "0199e7a0-1234-7abc-8def-0123456789ab";

describe("share-link tokens", () => {
  it("are 65 URL-safe characters that parse back to the organization and the secret's hash", () => {
    const { token, secretHash } = newShareLinkToken(organizationId);
    expect(token).toMatch(/^[A-Za-z0-9_-]{65}$/);
    expect(parseShareLinkToken(token)).toEqual({ organizationId, secretHash });
  });

  it("are different every time", () => {
    expect(newShareLinkToken(organizationId).token).not.toBe(newShareLinkToken(organizationId).token);
  });

  it("refuse anything else", () => {
    const { token } = newShareLinkToken(organizationId);
    expect(parseShareLinkToken(token.slice(1))).toBeNull();
    expect(parseShareLinkToken(`${token.slice(0, 64)}=`)).toBeNull();
    expect(parseShareLinkToken("")).toBeNull();
    // Base64 has spare bits in a part's last character: a variant that decodes to the same bytes is refused, so
    // each link has exactly one token.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const variant = alphabet.charAt(alphabet.indexOf(token.charAt(21)) + 1);
    expect(parseShareLinkToken(`${token.slice(0, 21)}${variant}${token.slice(22)}`)).toBeNull();
  });

  it("refuse an organization id that isn't a UUID", () => {
    expect(() => newShareLinkToken("not-a-uuid")).toThrow(RangeError);
  });
});

describe("truncateIpAddress", () => {
  it("keeps the first three parts of an IPv4 address", () => {
    expect(truncateIpAddress("203.0.113.77")).toBe("203.0.113.0");
    expect(truncateIpAddress("::ffff:198.51.100.9")).toBe("198.51.100.0");
  });

  it("keeps the first 48 bits of an IPv6 address", () => {
    expect(truncateIpAddress("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe("2001:db8:85a3::");
    expect(truncateIpAddress("2001:db8::1")).toBe("2001:db8:0::");
    expect(truncateIpAddress("1::2:3:4:5:6:7")).toBe("1:0:2::");
    expect(truncateIpAddress("fe80::1%eth0")).toBe("fe80:0:0::");
  });

  it("drops anything that isn't an address", () => {
    expect(truncateIpAddress(null)).toBeNull();
    expect(truncateIpAddress("unknown")).toBeNull();
    expect(truncateIpAddress("")).toBeNull();
  });
});
