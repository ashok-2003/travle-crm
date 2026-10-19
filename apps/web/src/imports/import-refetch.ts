// How often an import's screen asks for it again (D37): every 2 seconds while the worker reads, checks or adds it, and
// not at all otherwise. Each kind's hook passes it to its own router's query.
import type { ImportDetail } from "@travel-crm/contracts/imports";

const working = new Set<ImportDetail["status"]>(["reading", "checking", "adding"]);

export function importRefetchInterval(detail: ImportDetail | undefined): 2000 | false {
  return detail !== undefined && working.has(detail.status) ? 2000 : false;
}
