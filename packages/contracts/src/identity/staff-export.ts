// A staff export's columns and words (spec B52): the header row, in order, and the Status column's two words, which are
// the Staff screen's own (staff.json's "mustChangePassword"; a web test holds them equal).

export const staffExportHeaders = [
  "Name",
  "Username",
  "Email",
  "Phone",
  "Role",
  "Joined",
  "Status",
  "Last active",
] as const;
export type StaffExportHeader = (typeof staffExportHeaders)[number];

/** The Status column's words (B52): "Active", or the flag the Staff screen shows beside a temporary password. */
export const staffExportStatusWords = { active: "Active", mustChangePassword: "Must change password" } as const;
