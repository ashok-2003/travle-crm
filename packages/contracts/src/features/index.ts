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
  /**
   * Automatic lead assignment and its extras (release C): rules, turns or fewest open leads for imports and Sheets, the
   * slow-reply alert, the assignment settings, the away switch and the Unassigned queue. Off until release 4 (owner,
   * 2026-10-22): every new lead from an import or a Sheet goes to the default owner, a returning customer's too, as in
   * release 2, and the alert, the settings screen, the away switch and the queue are hidden and refused. The
   * lead_assignment tables and models stay. The tests of the assignment turn it on with
   * `vi.mock("@travel-crm/contracts/features", () => ({ features: { automaticAssignment: true } }))`.
   */
  readonly automaticAssignment: boolean;
  /**
   * Marketing consent (website form, spec 0.1.2): the form's "send me offers" tickbox, the consent ledger's screens
   * and the person card's consent line. Off until the legal read of DPDP consent is done (owner's answer,
   * 2026-10-22): the settings page shows no offers switch, the public form returns `offersTickbox: false` and shows
   * no tickbox, and a submission that sets `offers` is refused `VALIDATION`. The tables stay. The tests of consent
   * turn it on with `vi.mock("@travel-crm/contracts/features", () => ({ features: { marketingConsent: true } }))`.
   */
  readonly marketingConsent: boolean;
}

export const features: Features = {
  twoFactor: false,
  automaticAssignment: false,
  marketingConsent: false,
};
