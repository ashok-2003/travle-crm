// The lead list and its counts as composable SQL (R11), so the performance tests EXPLAIN exactly what runs: newest
// first, keyset on the id, never OFFSET. The open stages are written out as the partial indexes' predicate is, so the
// planner can use lead_open, lead_open_by_owner and lead_open_stage_counts whatever the parameters; a search reads
// person through its trigram indexes (R5).
import { isOpenStage, openLeadStages, type LeadSource, type LeadStage, type TripType } from "@travel-crm/contracts/crm";
import { emptySql, joinSql, sql, type Sql } from "@travel-crm/db";

/** What one page of the list asks for, its scope already applied. */
export interface LeadListFilter {
  /** Whose leads: one owner, or null for everyone. */
  ownerUserId: string | null;
  /** Only the leads nobody owns: the Unassigned queue (release C). */
  unassignedOnly?: true;
  stages: readonly LeadStage[];
  source?: LeadSource;
  destinationId?: string;
  tripType?: TripType;
  /** A name (forgiving of typos) or four or more digits of a phone (R5). */
  search?: { kind: "name"; text: string } | { kind: "digits"; digits: string };
  /** The last lead id of the previous page. */
  before?: string;
  /** The newest lead id the list may hold: an export's bound, so leads added while it runs stay out of it. */
  through?: string;
  limit: number;
}

/** The counts' filter: the list's, without the stage and the page. */
export type LeadCountsFilter = Omit<LeadListFilter, "stages" | "before" | "limit">;

/** The open stages exactly as the partial indexes' predicate holds them. */
const OPEN_STAGES = sql`lead.stage = ANY (ARRAY['new', 'contacted', 'quote_sent', 'booking_requested'])`;

/** Escapes LIKE's wildcards, so "%" and "_" in a search are letters. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

function stageCondition(stages: readonly LeadStage[]): Sql {
  if (stages.length === 0) return sql`AND FALSE`;
  const onlyOpen = stages.every(isOpenStage);
  if (onlyOpen && openLeadStages.every((stage) => stages.includes(stage))) return sql`AND ${OPEN_STAGES}`;
  // Open stages alone keep the open predicate beside their own, so the open indexes still serve the narrower list.
  return sql`${onlyOpen ? sql`AND ${OPEN_STAGES}` : emptySql} AND lead.stage IN (${joinSql([...stages])})`;
}

function searchCondition(search: LeadListFilter["search"]): Sql {
  if (search === undefined) return emptySql;
  if (search.kind === "digits") return sql`AND person.phone_e164 LIKE ${`%${search.digits}%`}`;
  return sql`AND (person.name ILIKE ${likePattern(search.text)} OR ${search.text} <% person.name)`;
}

/** Everything but the stage and the page: whose leads, the filters, the search; on live leads of live people. */
function filterConditions(filter: LeadCountsFilter): Sql {
  return sql`lead.deleted_at IS NULL
    ${filter.ownerUserId === null ? emptySql : sql`AND lead.owner_user_id = ${filter.ownerUserId}::uuid`}
    ${filter.unassignedOnly ? sql`AND lead.owner_user_id IS NULL` : emptySql}
    ${filter.source === undefined ? emptySql : sql`AND lead.source = ${filter.source}`}
    ${filter.destinationId === undefined ? emptySql : sql`AND lead.destination_id = ${filter.destinationId}::uuid`}
    ${filter.tripType === undefined ? emptySql : sql`AND lead.trip_type = ${filter.tripType}`}
    ${searchCondition(filter.search)}`;
}

const PERSON = sql`JOIN person ON person.organization_id = lead.organization_id AND person.id = lead.person_id
  AND person.deleted_at IS NULL`;

/** One page of the list's rows, newest first. */
export function leadListQuery(filter: LeadListFilter): Sql {
  return sql`
    SELECT lead.id, lead.stage, lead.returning, lead.owner_user_id AS "ownerUserId", lead.source,
      lead.created_at AS "createdAt", lead.destination_id AS "destinationId", lead.travel_kind AS "travelKind",
      lead.travel_start AS "travelStart", lead.travel_end AS "travelEnd", lead.travel_month AS "travelMonth",
      lead.adults, cardinality(lead.children_ages) AS "childrenCount", lead.budget_paise AS "budgetPaise",
      lead.budget_basis AS "budgetBasis", person.name AS "personName", person.phone_e164 AS "personPhone"
    FROM lead ${PERSON}
    WHERE ${filterConditions(filter)} ${stageCondition(filter.stages)}
      ${filter.before === undefined ? emptySql : sql`AND lead.id < ${filter.before}::uuid`}
      ${filter.through === undefined ? emptySql : sql`AND lead.id <= ${filter.through}::uuid`}
    ORDER BY lead.id DESC
    LIMIT ${filter.limit}`;
}

/** Open leads counted by stage; a stage with none is left out. */
export function leadCountsQuery(filter: LeadCountsFilter): Sql {
  return sql`
    SELECT lead.stage, count(*)::int AS n
    FROM lead ${filter.search === undefined ? emptySql : PERSON}
    WHERE ${filterConditions(filter)} AND ${OPEN_STAGES}
    GROUP BY lead.stage`;
}

/** The leads a list holds across all its pages (B41's count): the same conditions as leadListQuery, on live people. */
export function exportCountQuery(filter: LeadCountsFilter & { stages: readonly LeadStage[]; through?: string }): Sql {
  return sql`
    SELECT count(*)::int AS n
    FROM lead ${PERSON}
    WHERE ${filterConditions(filter)} ${stageCondition(filter.stages)}
      ${filter.through === undefined ? emptySql : sql`AND lead.id <= ${filter.through}::uuid`}`;
}

/**
 * What an export writes that the list's page doesn't select, for the page's leads: by id under the organization's row-level
 * security, so the (organization_id, id) key serves it, in no order (the caller keeps the page's).
 */
export function leadExportRowsQuery(leadIds: readonly string[]): Sql {
  return sql`
    SELECT lead.id, person.email, person.instagram_handle AS "instagramHandle",
      lead.children_ages AS "childrenAges", lead.departure_city AS "departureCity", lead.trip_type AS "tripType",
      lead.hotel_category AS "hotelCategory", lead.food, lead.room_type AS "roomType",
      lead.source_detail AS "sourceDetail"
    FROM lead ${PERSON}
    WHERE lead.id = ANY(${[...leadIds]}::uuid[])`;
}
