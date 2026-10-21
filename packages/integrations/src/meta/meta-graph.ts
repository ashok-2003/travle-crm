// The Meta Graph port (release D, lead ads; release E adds WhatsApp's own): a page's name, subscribing a page to its
// leadgen webhook, and one lead ad answer by its id. Every call carries the page's own access token.

/** One answer to a lead ad form: its id, when it came, its form, and each field's first value by the field's name. */
export interface MetaLead {
  id: string;
  createdTime: string;
  formId: string | null;
  adName: string | null;
  campaignName: string | null;
  fields: Readonly<Record<string, string>>;
}

export class MetaGraphError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | null,
    message: string,
  ) {
    super(message);
    this.name = "MetaGraphError";
  }
}

export interface MetaGraph {
  /** The page's name; throws MetaGraphError when the token can't read it. */
  pageName(pageId: string, pageAccessToken: string): Promise<string>;
  /** Subscribes our app to the page's leadgen events, so each new lead is sent to our webhook. */
  subscribeToLeads(pageId: string, pageAccessToken: string): Promise<void>;
  lead(leadgenId: string, pageAccessToken: string): Promise<MetaLead>;
}
