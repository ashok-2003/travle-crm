// What the visitor's enquiry form takes, shared by the hosted page, the embed and the settings Preview (website form spec 8):
// one form component, three places.
import type { PublicForm, WebsiteEnquiryInput } from "@travel-crm/contracts/website-forms";

export interface WebsiteFormViewProps {
  form: PublicForm;
  /** Where it is shown: a Preview never sends, and the embed reports its height to the page around it. */
  mode: "hosted" | "embedded" | "preview";
  /** The Preview's frame width in pixels (phone or desktop). */
  width?: number;
  /** The Preview's form is filled with made-up answers (spec 3.4); a visitor's starts empty. */
  sample?: boolean;
  /** Sends the enquiry; rejects with the refusal reason the form shows under the button (W41). */
  send: (body: WebsiteEnquiryInput) => Promise<void>;
}
