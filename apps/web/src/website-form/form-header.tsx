// The top of the visitor's form: the agency, the heading (the page's one h1) and the introduction.
import type { PublicForm } from "@travel-crm/contracts/website-forms";
import { PageTitle } from "@/components/page-title";
import { AgencyMark } from "./agency-mark";

export function FormHeader({ form, headingId, heading }: { form: PublicForm; headingId: string; heading: string }) {
  return (
    <header className="flex flex-col gap-4">
      <AgencyMark name={form.organizationName} logoUrl={form.logoUrl} />
      <div className="flex flex-col gap-2">
        <PageTitle className="[overflow-wrap:anywhere]">
          <span id={headingId}>{heading}</span>
        </PageTitle>
        {form.introduction !== null && <p className="text-muted-foreground">{form.introduction}</p>}
      </div>
    </header>
  );
}
