// Answers a tRPC batch the way the api does: as a plain JSON array, or, when the browser asked for a stream
// (`trpc-accept: application/jsonl`, which every query does), as the jsonl form of the same items.
export type WireItem =
  | { result: { data: unknown } }
  | { error: { message: string; code: number; data: { code?: string; httpStatus: number; reason?: string | null } } };

/** True when the request asked for a streamed answer. */
export function wantsStream(init?: RequestInit | { headers?: unknown }, input?: RequestInfo | URL): boolean {
  const headers = new Headers(
    (init?.headers as HeadersInit | undefined) ?? (input instanceof Request ? input.headers : undefined),
  );
  return headers.get("trpc-accept") === "application/jsonl";
}

export function jsonl(items: WireItem[]): string {
  const header: Record<string, unknown> = {};
  const chunks: string[] = [];
  let next = items.length;
  items.forEach((item, index) => {
    header[String(index)] = [[0], [null, 0, index]];
    if ("error" in item) {
      chunks.push(JSON.stringify([index, 0, [[item]]]));
      return;
    }
    const [asResult, asData] = [next++, next++];
    chunks.push(JSON.stringify([index, 0, [[{ result: 0 }], ["result", 0, asResult]]]));
    chunks.push(JSON.stringify([asResult, 0, [[{ data: 0 }], ["data", 0, asData]]]));
    chunks.push(JSON.stringify([asData, 0, [[item.result.data ?? null]]]));
  });
  return [JSON.stringify(header), ...chunks].join("\n") + "\n";
}

/** The response to a batch of items: `streamed` for a request that asked for the stream. */
export function wireResponse(items: WireItem[], streamed: boolean, status = 200): Response {
  if (!streamed) return Response.json(items, { status });
  return new Response(jsonl(items), { status: 200, headers: { "content-type": "application/json" } });
}
