// One of the lite agent's two model calls: its system pieces, the blocks of its user message in order, the schema it
// answers to and the lookups it may ask for. A super admin's page; the recorded codes show as recorded.
import type { AiModelCall } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// A recorded name shows as it was recorded.
const code = (chunks: ReactNode) => <span className="numbers wrap-anywhere">{chunks}</span>;

export function ModelCallCard({ call }: { call: AiModelCall }) {
  const t = useTranslations("consoleAi.prompts");
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={3}>
          {t(`call.${call.name}`)}
        </CardTitle>
        <CardDescription>{t(`callIntro.${call.name}`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p>{t.rich("system", { pieces: call.system.join(", "), code })}</p>
        <p>{t("blocks")}</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("columns.block")}</TableHead>
              <TableHead scope="col">{t("columns.purpose")}</TableHead>
              <TableHead scope="col" className="text-right">
                {t("columns.budget")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {call.blocks.map((block) => (
              <TableRow key={block.title}>
                {/* The block's title and purpose are the words the model is given, shown as recorded and not translated. */}
                <TableCell className="numbers wrap-anywhere whitespace-normal">{block.title}</TableCell>
                <TableCell className="wrap-anywhere whitespace-normal">{block.purpose}</TableCell>
                <TableCell className="numbers text-right">{block.budget}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p>{t.rich("answer", { name: call.answer, code })}</p>
        <p>
          {call.lookups.length === 0 ? t("noLookups") : t.rich("lookups", { tools: call.lookups.join(", "), code })}
        </p>
      </CardContent>
    </Card>
  );
}
