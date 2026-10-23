// Where an enquiry came from, kept in the audit entries it makes: the website form's id (W24), or a Meta lead ad's form
// and lead ids (spec M9). Ids only, never an answer.
export interface EnquiryAuditDetail {
  formId: string;
  metaLeadId?: string;
}
