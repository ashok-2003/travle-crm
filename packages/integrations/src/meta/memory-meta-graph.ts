// The Meta Graph port in memory, for tests and local work: pages and leads a test puts in.
import { MetaGraphError, type MetaGraph, type MetaLead } from "./meta-graph.js";

export interface MemoryMetaGraph extends MetaGraph {
  pages: Map<string, { name: string; token: string; subscribed: boolean }>;
  leads: Map<string, MetaLead>;
}

export function createMemoryMetaGraph(): MemoryMetaGraph {
  const pages = new Map<string, { name: string; token: string; subscribed: boolean }>();
  const leads = new Map<string, MetaLead>();
  const pageFor = (pageId: string, token: string) => {
    const page = pages.get(pageId);
    if (page?.token !== token) throw new MetaGraphError(400, 190, "Invalid token");
    return page;
  };
  return {
    pages,
    leads,
    pageName: (pageId, token) => Promise.resolve(pageFor(pageId, token).name),
    subscribeToLeads: (pageId, token) => {
      pageFor(pageId, token).subscribed = true;
      return Promise.resolve();
    },
    lead: (leadgenId) => {
      const lead = leads.get(leadgenId);
      return lead ? Promise.resolve(lead) : Promise.reject(new MetaGraphError(404, 100, "No such lead"));
    },
  };
}
