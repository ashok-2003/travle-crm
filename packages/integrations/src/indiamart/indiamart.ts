// The IndiaMART port (release D): a seller's enquiries in a time window, from IndiaMART's CRM Listing API, with the
// CRM key the seller copies from their Lead Manager. Plain fetch; no SDK.

export interface IndiaMartEnquiry {
  /** IndiaMART's own id for the enquiry, which keeps it from coming in twice. */
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  product: string | null;
  message: string | null;
}

export class IndiaMartError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "IndiaMartError";
  }
}

export interface IndiaMart {
  enquiries(crmKey: string, from: Date, to: Date): Promise<IndiaMartEnquiry[]>;
}

const LISTING = "https://mapi.indiamart.com/wservce/crm/crmListing/v2/";

/** IndiaMART's time format, in India time: "21-Oct-2026 14:05:00". */
function indiaMartTime(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: string) => parts.find((each) => each.type === type)?.value ?? "";
  return `${part("day")}-${part("month")}-${part("year")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

export function createRealIndiaMart(fetchImplementation: typeof fetch = fetch): IndiaMart {
  return {
    async enquiries(crmKey, from, to) {
      const query = new URLSearchParams({
        glusr_crm_key: crmKey,
        start_time: indiaMartTime(from),
        end_time: indiaMartTime(to),
      });
      const response = await fetchImplementation(`${LISTING}?${query.toString()}`, {
        signal: AbortSignal.timeout(30_000),
      });
      const body = (await response.json().catch(() => ({}))) as { CODE?: number; RESPONSE?: unknown };
      if (!response.ok || (body.CODE !== undefined && body.CODE !== 200 && body.CODE !== 204)) {
        throw new IndiaMartError(response.status, `IndiaMART answered ${String(body.CODE ?? response.status)}`);
      }
      const rows = Array.isArray(body.RESPONSE) ? (body.RESPONSE as Record<string, unknown>[]) : [];
      return rows.flatMap((row) => {
        const id = text(row.UNIQUE_QUERY_ID);
        const name = text(row.SENDER_NAME);
        if (id === null || name === null) return [];
        return [
          {
            id,
            name,
            phone: text(row.SENDER_MOBILE),
            email: text(row.SENDER_EMAIL),
            city: text(row.SENDER_CITY),
            product: text(row.QUERY_PRODUCT_NAME),
            message: text(row.QUERY_MESSAGE),
          },
        ];
      });
    },
  };
}

/** IndiaMART in memory: enquiries a test puts in, given whatever the window. */
export function createMemoryIndiaMart(): IndiaMart & { added: IndiaMartEnquiry[] } {
  const added: IndiaMartEnquiry[] = [];
  return { added, enquiries: () => Promise.resolve([...added]) };
}
