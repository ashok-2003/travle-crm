// Public API of @travel-crm/contracts/features: the product's switches, read by the domain, the api and the web app
// alike. Code constants, not environment variables: a switch that changes how people sign in is changed by a commit
// and reviewed like the code it turns on or off.

export interface Features {
  /**
   * Two-factor sign-in (ADR 0006, ADR 0025). Off since 2026-10-16 at the owner's word: not worth the hassle for an
   * agency's staff yet. Off, Better Auth's two-factor plugin and the staff trusted-device plugin aren't registered,
   * so nobody is asked for a code and /api/auth/two-factor/* doesn't exist; the console and support's impersonation
   * take platform staff with a password alone; no member's pending step is two-factor; and the screens show none of
   * it (the account's row, the setup and code pages, the organization's requirement, the staff lists' state). The
   * database keeps its columns and rows, and every line of the code stays.
   *
   * The risk while it is off: platform staff, who reach every organization's data, sign in with a password alone.
   * Turn it back on (true) for them before real agencies use the product. It turns on for everyone at once, from
   * what is stored: every organization with require_two_factor enforces it again, and everyone with
   * two_factor_enabled is asked for codes from their old secret, which they may have deleted from their phone
   * meanwhile. Check those rows first. The tests that prove what it brings back run with it on:
   * `vi.mock("@travel-crm/contracts/features", () => ({ features: { twoFactor: true } }))`.
   */
  readonly twoFactor: boolean;
}

export const features: Features = { twoFactor: false };
