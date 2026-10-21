// An import's counts as labelled values (spec 3.2 step 4): "New leads 1,094", the numbers in mono with lakh grouping.
import { Details } from "@/components/details";
import { formatCount } from "@/lib/format";

export function ImportCounts({ items }: { items: readonly { label: string; count: number }[] }) {
  return (
    <Details
      rows={items.map(({ label, count }) => ({ label, value: <span className="numbers">{formatCount(count)}</span> }))}
    />
  );
}
