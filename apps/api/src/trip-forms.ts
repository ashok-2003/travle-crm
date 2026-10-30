// The forms on the trip page (release 6): "I've paid", a traveller's details and the feedback. Plain forms posting back to the
// page's own link, each saying which it is in a hidden field; a picture is added by the page's script (trip-upload-script.ts)
// into a hidden field, and the form works without it. Every value is escaped.
import type { PublicTrip } from "@travel-crm/domain/bookings";
import { escapeHtml } from "./public-html.js";

/** Whole rupees and paise as an input's value, from integer paise: "12500.00". */
export const rupeesValue = (paise: number) =>
  `${String(Math.floor(paise / 100))}.${String(paise % 100).padStart(2, "0")}`;

const field = (id: string, label: string, input: string) => `<label for="${id}">${escapeHtml(label)}</label>${input}`;

function text(
  id: string,
  name: string,
  label: string,
  value: string,
  options: { required?: boolean; type?: string; max?: number; autocomplete?: string } = {},
) {
  return field(
    id,
    label,
    `<input id="${id}" name="${name}" type="${options.type ?? "text"}" value="${escapeHtml(value)}" maxlength="${String(options.max ?? 120)}"${options.required ? " required" : ""}${options.autocomplete ? ` autocomplete="${options.autocomplete}"` : ""}>`,
  );
}

function picture(
  prefix: string,
  kind: string,
  hidden: string,
  label: string,
  options: { multiple?: boolean; travellerId?: string } = {},
) {
  return `<label for="${prefix}-file">${escapeHtml(label)}</label>
<input id="${prefix}-file" type="file" accept="image/jpeg,image/png,image/webp"${options.multiple ? " multiple" : ""} data-kind="${kind}" data-target="${prefix}-ids" data-status="${prefix}-status"${options.travellerId ? ` data-traveller="${escapeHtml(options.travellerId)}"` : ""}>
<input id="${prefix}-ids" type="hidden" name="${hidden}" value=""><p class="hint" id="${prefix}-status" aria-live="polite"></p>`;
}

/** "I've paid" for a payment due (or, with none, for any amount): the amount, the UPI reference, a screenshot. */
export function claimForm(input: {
  key: string;
  label: string;
  installmentId: string | null;
  amountPaise: number;
}): string {
  const id = `claim-${input.key}`;
  return `<details><summary>${escapeHtml(input.label)}</summary>
<form method="post">
<input type="hidden" name="form" value="claim"><input type="hidden" name="installment" value="${escapeHtml(input.installmentId ?? "")}">
${text(`${id}-amount`, "amount", "Amount you paid (₹)", rupeesValue(input.amountPaise), { required: true, type: "text", max: 14 })}
${text(`${id}-reference`, "reference", "UPI reference or transaction number", "", { max: 60 })}
${picture(id, "claim", "screenshot", "Screenshot of the payment (optional)")}
<p class="hint">Add the reference or a screenshot. Your agent checks it against their bank and marks it received.</p>
<div class="row"><button type="submit" class="button">I've paid</button></div>
</form></details>`;
}

/** One traveller's details, as many fields as the booking's level asks for. */
export function travellerForm(trip: PublicTrip, index: number): string {
  const traveller = trip.travellers[index];
  if (traveller === undefined) return "";
  const id = `traveller-${String(index)}`;
  const detailed = trip.level !== "basic";
  const international = trip.level === "international";
  const gender = (value: string, label: string) =>
    `<option value="${value}"${traveller.gender === value ? " selected" : ""}>${label}</option>`;
  return `<form method="post">
<input type="hidden" name="form" value="traveller"><input type="hidden" name="traveller" value="${escapeHtml(traveller.id)}">
${text(`${id}-name`, "name", "Name as on ID", traveller.name, { required: true, autocomplete: "name" })}
${text(`${id}-dob`, "dateOfBirth", "Date of birth", traveller.dateOfBirth ?? "", { required: true, type: "date", max: 10 })}
${field(`${id}-gender`, "Gender", `<select id="${id}-gender" name="gender"><option value="">Prefer not to say</option>${gender("female", "Female")}${gender("male", "Male")}${gender("other", "Other")}</select>`)}
${text(`${id}-phone`, "phone", "Phone", traveller.phone, { type: "tel", max: 40, autocomplete: "tel" })}
${
  detailed
    ? `${text(`${id}-emergency-name`, "emergencyName", "Emergency contact name", traveller.emergencyName, { required: true })}
${text(`${id}-emergency-phone`, "emergencyPhone", "Emergency contact phone", traveller.emergencyPhone, { required: true, type: "tel", max: 40 })}
${field(`${id}-medical`, "Medical notes or allergies (optional)", `<textarea id="${id}-medical" name="medicalNotes" maxlength="1000">${escapeHtml(traveller.medicalNotes)}</textarea>`)}`
    : ""
}
${
  international
    ? `<input type="hidden" name="idKind" value="passport">
${text(`${id}-passport`, "idNumber", traveller.hasIdentity ? "Passport number (saved; type again to change it)" : "Passport number", "", { required: !traveller.hasIdentity, max: 40 })}
${text(`${id}-issued`, "idIssuedOn", "Passport issued on", "", { type: "date", max: 10 })}
${text(`${id}-expires`, "idExpiresOn", "Passport expires on", "", { type: "date", max: 10 })}
${text(`${id}-nationality`, "idNationality", "Nationality", "", { max: 60 })}
${picture(`${id}-idphoto`, "id_photo", "idPhoto", "Photo of the passport page (optional)", { travellerId: traveller.id })}`
    : ""
}
<div class="row"><button type="submit" class="button">Save details</button></div>
</form>`;
}

const stars = (name: string, legend: string, required: boolean) =>
  `<fieldset><legend>${escapeHtml(legend)}</legend><div class="stars">${[5, 4, 3, 2, 1]
    .map(
      (n) =>
        `<label><input type="radio" name="${name}" value="${String(n)}"${required && n === 5 ? " required" : ""}> ${String(n)}</label>`,
    )
    .join("")}</div></fieldset>`;

/** The feedback form: stars overall and for the hotel, transport and guide, a comment, photos, and whether it may be shared. */
export function feedbackForm(): string {
  return `<form method="post">
<input type="hidden" name="form" value="feedback">
${stars("overall", "How was your trip overall? (5 is best)", true)}
${stars("hotel", "The hotels", false)}
${stars("transport", "The transport", false)}
${stars("guide", "Your guide", false)}
${field("feedback-comment", "Anything you'd like to tell us", `<textarea id="feedback-comment" name="comment" maxlength="2000"></textarea>`)}
${picture("feedback-photos", "feedback_photo", "photos", "Photos from your trip (optional, up to 5)", { multiple: true })}
<label class="tick"><input type="checkbox" name="mayShare" value="yes"> You may share my review and photos</label>
<div class="row"><button type="submit" class="button">Send feedback</button></div>
</form>`;
}
