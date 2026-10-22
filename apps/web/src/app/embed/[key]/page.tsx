// /embed/<key>: the same form as /f/<key>, without the page around it.
import { FormPage } from "@/website-form/form-page";

export default async function EmbeddedFormPage({ params }: { params: Promise<{ key: string }> }) {
  return <FormPage formKey={(await params).key} mode="embedded" />;
}
