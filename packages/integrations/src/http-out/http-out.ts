// Posting JSON to an address of the agency's own (its webhooks), with a timeout: the status, or 0 for no answer.
// Redirects are not followed, so a webhook can't be bounced to an address the agency didn't give.
export interface HttpOut {
  postJson(url: string, body: string, headers: Readonly<Record<string, string>>): Promise<{ status: number }>;
}

export function createRealHttpOut(fetchImplementation: typeof fetch = fetch, timeoutMs = 10_000): HttpOut {
  return {
    async postJson(url, body, headers) {
      try {
        const response = await fetchImplementation(url, {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body,
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        });
        return { status: response.status };
      } catch {
        return { status: 0 };
      }
    },
  };
}

export interface MemoryHttpOut extends HttpOut {
  posts: { url: string; body: string; headers: Readonly<Record<string, string>> }[];
}

/** Posting in memory: every post kept, answered with the status a test sets. */
export function createMemoryHttpOut(status = 200): MemoryHttpOut {
  const posts: MemoryHttpOut["posts"] = [];
  return {
    posts,
    postJson: (url, body, headers) => {
      posts.push({ url, body, headers });
      return Promise.resolve({ status });
    },
  };
}
