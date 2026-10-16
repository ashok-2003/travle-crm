// A stored phone number (E.164) as Indian screens write it (DESIGN.md section 9): "+91 98765 43210". Numbers of other
// countries are shown as stored, which is already unambiguous.
const INDIAN_NUMBER = /^\+91(\d{5})(\d{5})$/;

export function formatPhoneNumber(e164: string): string {
  const match = INDIAN_NUMBER.exec(e164);
  return match ? `+91 ${match[1] ?? ""} ${match[2] ?? ""}` : e164;
}
