// The forms read the visitor's address by a configured number of proxy hops (W32, W33); sign-in's reader stays strict.
import { describe, expect, it } from "vitest";
import { clientAddressReport, formClientAddressFrom } from "../src/form-client-address.js";

const base = { headerNames: ["x-forwarded-for"], trustedProxies: [] as string[] };

function requestWith(header: string | null, name = "x-forwarded-for"): Request {
  return new Request("http://api.test/", { headers: header === null ? {} : { [name]: header } });
}

describe("formClientAddressFrom", () => {
  it("reads entry k-N counting from the left", () => {
    const read = formClientAddressFrom({ ...base, proxyHops: 1 });
    expect(read(requestWith("203.0.113.9, 10.0.0.1"))).toBe("203.0.113.9");
    const two = formClientAddressFrom({ ...base, proxyHops: 2 });
    expect(two(requestWith("203.0.113.9, 10.0.0.1, 10.0.0.2"))).toBe("203.0.113.9");
  });

  it("never reads a forged leftmost entry", () => {
    const one = formClientAddressFrom({ ...base, proxyHops: 1 });
    expect(one(requestWith("6.6.6.6, 203.0.113.9, 10.0.0.1"))).toBe("203.0.113.9");
    const two = formClientAddressFrom({ ...base, proxyHops: 2 });
    expect(two(requestWith("6.6.6.6, 7.7.7.7, 203.0.113.9, 10.0.0.1, 10.0.0.2"))).toBe("203.0.113.9");
  });

  it("gives no address when the header has N entries or fewer", () => {
    const one = formClientAddressFrom({ ...base, proxyHops: 1 });
    expect(one(requestWith("10.0.0.1"))).toBeNull();
    const two = formClientAddressFrom({ ...base, proxyHops: 2 });
    expect(two(requestWith("203.0.113.9, 10.0.0.1"))).toBeNull();
    expect(two(requestWith(null))).toBeNull();
  });

  it("gives no address for an invalid entry", () => {
    const one = formClientAddressFrom({ ...base, proxyHops: 1 });
    expect(one(requestWith("not-an-ip, 10.0.0.1"))).toBeNull();
  });

  it("counts IPv6 as its /64", () => {
    const one = formClientAddressFrom({ ...base, proxyHops: 1 });
    const first = one(requestWith("2001:db8:1:2:aaaa:bbbb:cccc:dddd, 10.0.0.1"));
    const second = one(requestWith("2001:db8:1:2:1:2:3:4, 10.0.0.1"));
    expect(first).toBe("2001:db8:1:2::");
    expect(second).toBe(first);
  });

  it("reads an IPv4-mapped IPv6 address as the IPv4 address", () => {
    const one = formClientAddressFrom({ ...base, proxyHops: 1 });
    expect(one(requestWith("::ffff:203.0.113.9, 10.0.0.1"))).toBe("203.0.113.9");
  });

  it("follows the sign-in rule while the hops are unset", () => {
    const read = formClientAddressFrom({ ...base, proxyHops: null });
    expect(read(requestWith("203.0.113.9"))).toBe("203.0.113.9");
    expect(read(requestWith("6.6.6.6, 203.0.113.9"))).toBeNull();
    const behind = formClientAddressFrom({ ...base, trustedProxies: ["10.0.0.0/8"], proxyHops: null });
    expect(behind(requestWith("6.6.6.6, 203.0.113.9, 10.0.0.1"))).toBe("203.0.113.9");
  });

  it("reads only the first configured header present", () => {
    const read = formClientAddressFrom({
      headerNames: ["x-real", "x-forwarded-for"],
      trustedProxies: [],
      proxyHops: 1,
    });
    const request = new Request("http://api.test/", {
      headers: { "x-real": "10.0.0.1", "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(read(request)).toBeNull();
  });
});

describe("clientAddressReport", () => {
  it("names the address, the entries and the hops, and nothing else", () => {
    const request = new Request("http://api.test/", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1", cookie: "secret=1", authorization: "Bearer x" },
    });
    const report = clientAddressReport(request, { ...base, proxyHops: 1 });
    expect(report).toEqual({ address: "203.0.113.9", entries: 2, hops: 1 });
  });

  it("counts no entries when the header is missing", () => {
    expect(clientAddressReport(requestWith(null), { ...base, proxyHops: null })).toEqual({
      address: null,
      entries: 0,
      hops: null,
    });
  });
});
