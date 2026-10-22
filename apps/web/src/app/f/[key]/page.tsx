// /f/<key>: the agency's enquiry form on a page of its own, for anyone with the link (no sign-in, no storage).
import type { Metadata } from "next";
import { FormPage } from "@/website-form/form-page";
import { hostedFormMetadata } from "@/website-form/form-metadata";

interface Params {
  params: Promise<{ key: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return hostedFormMetadata((await params).key);
}

export default async function HostedFormPage({ params }: Params) {
  return <FormPage formKey={(await params).key} mode="hosted" />;
}
