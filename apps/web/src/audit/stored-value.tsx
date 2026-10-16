"use client";

// One value of a change's before or after, shown as it was recorded: text and numbers as they are, true and false as
// Yes and No, a list one item a line, an object field by field. Nothing is looked up, decoded or fetched.
import { useTranslations } from "next-intl";

export function StoredValue({ value }: { value: unknown }) {
  const t = useTranslations("audit.change");
  const none = <span className="text-muted-foreground">{t("none")}</span>;
  if (value === null || value === undefined || value === "") return none;
  if (typeof value === "boolean") return <span>{value ? t("yes") : t("no")}</span>;
  if (typeof value === "number") return <span className="numbers">{String(value)}</span>;
  if (typeof value === "string") return <span className="break-words script-leading">{value}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return none;
    return (
      <ul className="flex flex-col gap-1">
        {value.map((item: unknown, index) => (
          // A recorded list has no ids, and an entry never changes, so its positions are stable keys.
          <li key={index}>
            <StoredValue value={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value !== "object") return none;
  return (
    <span className="flex flex-wrap gap-x-3">
      {Object.entries(value).map(([field, inner]: [string, unknown]) => (
        <span key={field} className="break-words">
          <span className="text-muted-foreground">{field}</span> <StoredValue value={inner} />
        </span>
      ))}
    </span>
  );
}
