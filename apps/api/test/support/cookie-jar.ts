// A small browser-like cookie store for app.request() tests. The last Set-Cookie for a name wins, and an empty value
// or Max-Age=0 deletes it: Better Auth sends deleting cookies before new ones, so joining headers naively breaks.
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  /** Stores the response's cookies and returns the response, so calls can be wrapped: jar.absorb(await post(...)). */
  absorb(response: Response): Response {
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair = ""] = setCookie.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value === "" || /max-age=0/i.test(setCookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  /** The Cookie header a browser would send. */
  get header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  names(): string[] {
    return [...this.cookies.keys()];
  }
}
