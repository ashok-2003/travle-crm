// What global-setup hands the tests, and what createIsolatedDatabase copies: shared by both without either importing
// the other.

/** Connection URLs of the test database, one per role. */
export interface DbUrls {
  superuser: string;
  migrator: string;
  runtime: string;
  platform: string;
}

/** The copy of the migrated database that global-setup makes. Nobody connects to it, so Postgres can copy it again. */
export const TEMPLATE_DATABASE = "app_template";
