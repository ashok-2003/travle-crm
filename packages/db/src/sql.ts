// Composable SQL (R11): the lead list, search and Today queries are built as Sql values and run with $queryRaw, so the
// performance tests EXPLAIN exactly the query the code runs. Values always travel as parameters: there is no raw().
import { Prisma } from "./generated/prisma/client.js";

/** A parameterised SQL fragment: sql`SELECT id FROM lead WHERE owner_user_id = ${userId}::uuid`. */
export const sql = Prisma.sql;

/** Fragments joined by a separator, e.g. joinSql(conditions, " AND "). */
export const joinSql = Prisma.join;

/** The fragment that adds nothing, for an optional condition. */
export const emptySql = Prisma.empty;

export type Sql = Prisma.Sql;
