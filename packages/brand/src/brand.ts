// The product's own identity (spec section 10): its name, colours, fonts and contacts, in one place.
// An organization's own logo, colours and terms are per-organization settings in the database, not these.

/**
 * A status colour (DESIGN.md section 2): a dot, a tinted badge background, and the dark text on it. Status colours
 * mean status only (confirmed, due, lost), and always come with a word.
 */
export interface StatusColour {
  readonly dot: string;
  readonly fill: string;
  readonly ink: string;
}

/** A staff role's badge (DESIGN.md "Role badges"): a tinted background and the dark text on it, with no dot. */
export interface RoleColour {
  readonly fill: string;
  readonly ink: string;
}

export const brand = {
  /** The working name (spec open item Q8). Code reads it from here; a check refuses it anywhere else. */
  productName: "Travel Agency OS",
  /** For the home screen icon and other tight spaces. */
  shortName: "Agency OS",
  tagline: "Run your travel agency in one place",
  /**
   * Who runs the product. The values on .example addresses are not confirmed yet: the product owner replaces them
   * before the first staging deploy (spec 13).
   */
  legalName: "Travel Agency OS (legal name to be confirmed)",
  website: "https://travel-agency-os.example",
  /** The product owner's address for now (given 2026-10-16), until the product has a domain of its own. */
  supportEmail: "workatashok@gmail.com",
  /** E.164, or null until the product owner gives one (an owner item): screens leave out a contact that is null. */
  supportPhone: null as string | null,
  /** The sender name on email the product sends for an organization: "<organization> via <this>". */
  emailSenderName: "Travel Agency OS",

  /**
   * Colour tokens, read by the web app's Tailwind theme, the PDF templates and the email layout. The values are the
   * ones in DESIGN.md's front matter; a web app test fails when the two disagree.
   */
  colours: {
    /** Text and the darkest surfaces. */
    ink: "#1a1a1a",
    /** Secondary text, captions and placeholders: 5.25:1 on canvas. */
    muted: "#6b6b6b",
    /** Page background: warm white. */
    canvas: "#fffdf9",
    /** Panels, table headers and the sidebar. */
    surface: "#f5f4f0",
    /** Thin lines between flat surfaces. Decorative only: never the one sign of a control or a selection. */
    hairline: "#e6e3dc",
    /** The edge of inputs and secondary buttons: 3.42:1 on canvas, enough for a control's boundary. */
    inputBorder: "#8a8a82",
    /** The one interactive colour: buttons, links, focus rings, the active item. */
    action: "#2563eb",
    actionPressed: "#1d4ed8",
    /** Selected chips and the active navigation item, with actionPressed as their text. */
    actionTint: "#eef2ff",
    /** Text on an action fill: 5.17:1 on action. */
    onAction: "#ffffff",
    /** People and conversations: the inbox, follow-ups, assignees. Information, never a button. */
    people: "#6a4bbd",
    peoplePressed: "#5b3fa6",
    peopleTint: "#efe7fd",
    peopleTintInk: "#4c2f97",
    /** Money: amounts received, margins, invoices and the Accounts area. Never a status. */
    money: "#034f46",
    moneyPressed: "#07352f",
    moneyTint: "#e3f1ee",
    status: {
      good: { dot: "#168f43", fill: "#e3f4e7", ink: "#14532d" },
      attention: { dot: "#c2680a", fill: "#fff3d6", ink: "#7a4100" },
      bad: { dot: "#d92d20", fill: "#fdecea", ink: "#9b1c1c" },
      neutral: { dot: "#6b6b6b", fill: "#ecebe6", ink: "#4a4a4a" },
    } satisfies Record<string, StatusColour>,
    /**
     * The open lead stages' own colours (DESIGN.md "Stage Colours"), subtle hues in the order a lead moves: sky, teal,
     * then lime on its way to Won's green. Quote sent is status amber (awaiting a reply), Won status green, Lost status
     * red and Not a lead status neutral, so those have no colour of their own here. Every value keeps a ΔE76 of 8 from
     * the action, people, money and status colours and from the other stages (test/brand.test.ts).
     */
    stage: {
      new: { dot: "#0c8bbb", fill: "#d3eefd", ink: "#04516f" },
      contacted: { dot: "#0b959b", fill: "#d5fcfe", ink: "#045b5f" },
      bookingRequested: { dot: "#719427", fill: "#edf9dc", ink: "#415a03" },
    } satisfies Record<string, StatusColour>,
    /**
     * Staff role badges (DESIGN.md "Role Badges"): the Owner role's fixed orchid, and five tints a role is given by its
     * key, so the same role always shows in the same colour. Each keeps a ΔE76 of 8 from the action, people, money,
     * status and stage colours, so a role never looks like a state. The web app picks by the tints' order and count:
     * adding, removing or reordering one recolours the agencies' own roles.
     */
    role: {
      owner: { fill: "#f9dfff", ink: "#693375" },
      rose: { fill: "#fee0eb", ink: "#802e53" },
      peach: { fill: "#fee3d4", ink: "#6f3f20" },
      gold: { fill: "#f7f7cc", ink: "#595501" },
      fern: { fill: "#d6f8d8", ink: "#36563a" },
      mint: { fill: "#d3fff2", ink: "#035e4d" },
    } satisfies Record<string, RoleColour>,
  },

  /** Font families. Every number (rupees, counts, dates in tables) uses the monospace one, so columns line up. */
  fonts: {
    title: "EB Garamond",
    ui: "Figtree",
    numbers: "IBM Plex Mono",
  },
} as const;

export type Brand = typeof brand;
