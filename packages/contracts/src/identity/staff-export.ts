// A staff export's columns (spec B52): the header row, in order. The staff export adds its own shapes here later.

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
