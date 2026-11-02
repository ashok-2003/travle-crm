// What a report of the catalogue is: its id, what the AI is told about it, the permissions it needs, and how it runs.
import type { AskRange, ReportAnswer, ReportQueryId } from "@travel-crm/contracts/reports";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../../identity/index.js";
import type { ReportPeriod } from "../figures.js";

export interface QueryContext {
  now: Date;
  period: ReportPeriod;
  /** The leads the asker sees: null for all of them, else their own user id (the reports' own scope). */
  owner: string | null;
  showsMoney: boolean;
}

export type QueryResult = Pick<ReportAnswer, "columns" | "rows">;

export interface ReportQuery {
  id: ReportQueryId;
  /** What the AI is told, with the id: the report in a line. */
  title: string;
  /** False for a report about now. */
  ranged: boolean;
  /** Every permission the asker needs; the money ones keep the report out of reach for anyone without money:view_reports. */
  requires: readonly Parameters<MemberAccess["permissions"]["has"]>[0][];
  /** Only a role that sees every lead. */
  allOnly?: boolean;
  run(tx: OrgTx, access: MemberAccess, context: QueryContext): Promise<QueryResult>;
}

export type { AskRange };
