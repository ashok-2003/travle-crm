// /f/<key>: the agency's enquiry form on a page of its own, for anyone with the link (no sign-in, no storage).
import { FormPage } from "@/website-form/form-page";

export default async function HostedFormPage({ params }: { params: Promise<{ key: string }> }) {
  return <FormPage formKey={(await params).key} mode="hosted" />;
}
