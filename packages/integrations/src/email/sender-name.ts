// The display name of email sent for an organization: its name, then ours, so people see who wrote and through what.
import { brand } from "@travel-crm/brand";

/** "Sharma Travels via <product name>". Runs of spaces and line breaks in the name become one space. */
export function senderNameFor(organizationName: string): string {
  return `${organizationName.replace(/\s+/g, " ").trim()} via ${brand.emailSenderName}`;
}
