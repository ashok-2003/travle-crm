// The Meta Graph port over Meta's HTTP API (graph.facebook.com), with fetch: no SDK.
import { MetaGraphError, type MetaGraph, type MetaLead } from "./meta-graph.js";

const GRAPH = "https://graph.facebook.com/v21.0";

interface GraphErrorBody {
  error?: { message?: string; code?: number };
}

async function call<T>(fetchImplementation: typeof fetch, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchImplementation(`${GRAPH}${path}`, { ...init, signal: AbortSignal.timeout(20_000) });
  const body = (await response.json().catch(() => ({}))) as T & GraphErrorBody;
  if (!response.ok || body.error) {
    // Meta's message can quote the token's owner; only the code and status travel on.
    throw new MetaGraphError(response.status, body.error?.code ?? null, `Meta answered ${String(response.status)}`);
  }
  return body;
}

const withToken = (token: string) => `access_token=${encodeURIComponent(token)}`;

export function createRealMetaGraph(fetchImplementation: typeof fetch = fetch): MetaGraph {
  return {
    async pageName(pageId, token) {
      const page = await call<{ name?: string }>(
        fetchImplementation,
        `/${encodeURIComponent(pageId)}?fields=name&${withToken(token)}`,
      );
      return page.name ?? pageId;
    },
    async subscribeToLeads(pageId, token) {
      await call(
        fetchImplementation,
        `/${encodeURIComponent(pageId)}/subscribed_apps?subscribed_fields=leadgen&${withToken(token)}`,
        { method: "POST" },
      );
    },
    async lead(leadgenId, token): Promise<MetaLead> {
      const found = await call<{
        id: string;
        created_time: string;
        form_id?: string;
        ad_name?: string;
        campaign_name?: string;
        field_data?: { name: string; values?: string[] }[];
      }>(
        fetchImplementation,
        `/${encodeURIComponent(leadgenId)}?fields=id,created_time,form_id,ad_name,campaign_name,field_data&${withToken(token)}`,
      );
      const fields: Record<string, string> = {};
      for (const field of found.field_data ?? []) {
        const value = field.values?.[0];
        if (value !== undefined) fields[field.name] = value;
      }
      return {
        id: found.id,
        createdTime: found.created_time,
        formId: found.form_id ?? null,
        adName: found.ad_name ?? null,
        campaignName: found.campaign_name ?? null,
        fields,
      };
    },
  };
}
