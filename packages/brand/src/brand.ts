// The product's own identity (spec section 10): its name, colours, fonts and contacts, in one place.
// An organization's own logo, colours and terms are per-organization settings in the database, not these.

/** A status colour: text and dot, background and border. Status colours mean status only (confirmed, due, lost). */
export interface StatusColour {
  readonly ink: string;
  readonly fill: string;
  readonly border: string;
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
  supportEmail: "support@travel-agency-os.example",
  supportPhone: "+910000000000",
  /** The sender name on email the product sends for an organization: "<organization> via <this>". */
  emailSenderName: "Travel Agency OS",

  /** Colour tokens, read by Tailwind (plan 5), the PDF templates and the email layout. */
  colours: {
    /** Text and the darkest surfaces. */
    ink: "#1a1a1a",
    /** Secondary text. */
    muted: "#6b6b70",
    /** Page background: warm white. */
    canvas: "#fffdf9",
    /** Panels, table headers and the sidebar. */
    surface: "#f5f4f0",
    /** Thin lines between flat surfaces. */
    hairline: "#e6e3dc",
    /** The main action, the active item and focus. */
    action: "#2563eb",
    actionPressed: "#1d4ed8",
    /** People and conversations. */
    people: "#6a4bbd",
    peoplePressed: "#5b3fa6",
    peopleTint: "#efe7fd",
    peopleTintInk: "#4c2f97",
    /** Money: amounts, margins, payments. */
    money: "#034f46",
    moneyPressed: "#07352f",
    status: {
      good: { ink: "#166534", fill: "#e6f6ec", border: "#bfe5cc" },
      attention: { ink: "#8a5a00", fill: "#fdf3d8", border: "#f1d999" },
      bad: { ink: "#9f1f17", fill: "#fde8e6", border: "#f5c4bf" },
    } satisfies Record<string, StatusColour>,
  },

  /** Font families. Every number (rupees, counts, dates in tables) uses the monospace one, so columns line up. */
  fonts: {
    title: "EB Garamond",
    ui: "Figtree",
    numbers: "IBM Plex Mono",
  },
} as const;

export type Brand = typeof brand;
