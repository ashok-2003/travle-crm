// "/" shows visitors the product's public page and sends someone signed in on to their home, by the session cookie's
// presence alone.
// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "@/proxy";

const visit = (cookie?: string) =>
  proxy(new NextRequest("https://app.example.in/", cookie ? { headers: { cookie } } : undefined));

describe("the proxy at /", () => {
  it("runs on / alone", () => {
    expect(config.matcher).toBe("/");
  });

  it("shows a visitor the public page", () => {
    const response = visit();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["__Secure-better-auth.session_token=abc", "better-auth.session_token=abc"])(
    "sends someone signed in (%s) on to their home",
    (cookie) => {
      const response = visit(cookie);
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://app.example.in/dashboard");
    },
  );
});
