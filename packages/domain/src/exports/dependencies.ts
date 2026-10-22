// What the exports module's listeners are built from: the files and spreadsheets ports, identity (the requester's
// access afresh, people's names, the staff), and the web app's address for links in a file.
import type { Logger } from "@travel-crm/integrations/logging";
import type { Spreadsheets } from "@travel-crm/integrations/spreadsheets";
import type { Files } from "../files/index.js";
import type { Identity } from "../identity/index.js";

export type ExportIdentity = Pick<Identity, "resolveAccess" | "memberContacts" | "staff">;

export interface ExportJobDependencies {
  files: Files;
  spreadsheets: Spreadsheets;
  identity: ExportIdentity;
  /** The web app's address, e.g. https://app.example.in, for a row's link (Lead link). */
  appUrl: string;
  /** Where an export writes its one summary line when it ends (ADR 0032); none writes nothing. */
  logger?: Logger;
}
