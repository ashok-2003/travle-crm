"use client";

// The staff import's end (spec 3.4, B46-B50): "12 people added", and the one place their temporary passwords can be
// seen. The browser made them and keeps them in this tab's memory only (password-store.ts): a notice to download them
// now (a CSV the browser writes itself, B48), then each person with their password and a copy button, a Table on a
// computer. Leaving the screen forgets them; coming back finds "These passwords were shown once" and B50's new ones.
import type { StaffImportedPerson } from "@travel-crm/contracts/identity";
import { CheckIcon, CircleAlertIcon, DownloadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ImportStatusBadge } from "@/imports/import-status-badge";
import { formatDayTime } from "@/lib/format";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useMe } from "@/session/me-context";
import { LostPasswords } from "./lost-passwords";
import { passwordSheet } from "./password-sheet";
import { passwordStore } from "./password-store";
import type { StaffImportPage } from "./use-staff-import";

/** The sheet as a file the browser saves, without it ever being sent anywhere. */
function saveSheet(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function PasswordsStep({ importId, page }: { importId: string; page: StaffImportPage }) {
  const t = useTranslations("staff.import.done");
  const me = useMe();
  const wide = useWideScreen();
  const [downloaded, setDownloaded] = useState(false);
  // The store isn't React state: asking again after the new passwords are made.
  const [, setVersion] = useState(0);
  const passwords = passwordStore.get(importId);
  const shown = page.added.filter((person) => passwords?.has(person.rowNumber));
  const passwordOf = (person: StaffImportedPerson) => passwords?.get(person.rowNumber) ?? "";
  const none = (text: string | null) => text ?? t("none");
  const when =
    page.finishedAt === null ? "" : formatDayTime(new Date(page.finishedAt), { timeZone: me.organization.timeZone });

  const download = () => {
    const sheet = passwordSheet(
      shown.map((person) => ({
        name: person.name,
        username: person.username,
        email: person.email,
        password: passwordOf(person),
      })),
      me.organization.code,
      `${window.location.origin}/sign-in`,
    );
    saveSheet(sheet, "staff-passwords.csv");
    setDownloaded(true);
  };

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {t("title", { count: page.progress.rowsAdded })}
            <ImportStatusBadge status="done" />
          </span>
        }
        intro={`${page.fileName}${when === "" ? "" : ` · ${when}`}`}
      />
      {shown.length === 0 ? (
        <LostPasswords
          importId={importId}
          waiting={page.added.filter((person) => person.mustChangePassword)}
          onMade={() => {
            setVersion((version) => version + 1);
          }}
        />
      ) : (
        <>
          <Alert>
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>{t("downloadNow")}</AlertTitle>
            <AlertDescription>{t("neverKept")}</AlertDescription>
          </Alert>
          <div>
            <Button disabled={downloaded} onClick={download}>
              {downloaded ? <CheckIcon aria-hidden="true" /> : <DownloadIcon aria-hidden="true" />}
              {downloaded ? t("downloaded") : t("download")}
            </Button>
          </div>
          {wide ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t("name")}</TableHead>
                  <TableHead scope="col">{t("username")}</TableHead>
                  <TableHead scope="col">{t("email")}</TableHead>
                  <TableHead scope="col">{t("password")}</TableHead>
                  <TableHead scope="col">
                    <span className="sr-only">{t("copy")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((person) => (
                  <TableRow key={person.memberId}>
                    <TableCell className="whitespace-normal script-leading">{person.name}</TableCell>
                    <TableCell className="whitespace-normal break-all">{none(person.username)}</TableCell>
                    <TableCell className="whitespace-normal break-all">{none(person.email)}</TableCell>
                    <TableCell>
                      <span className="numbers">{passwordOf(person)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <CopyButton value={passwordOf(person)} label={t("copyFor", { name: person.name })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <ItemGroup>
              {shown.map((person, index) => (
                <Fragment key={person.memberId}>
                  {index > 0 && <ItemSeparator />}
                  <Item size="sm" role="listitem">
                    <ItemContent>
                      <ItemTitle className="script-leading">{person.name}</ItemTitle>
                      <ItemDescription className="wrap-anywhere">
                        {[person.username, person.email].filter((name) => name !== null).join(" · ")}
                      </ItemDescription>
                      <span className="numbers">{passwordOf(person)}</span>
                    </ItemContent>
                    <ItemActions>
                      <CopyButton value={passwordOf(person)} label={t("copyFor", { name: person.name })} />
                    </ItemActions>
                  </Item>
                </Fragment>
              ))}
            </ItemGroup>
          )}
          <p className="text-muted-foreground">{t("firstSignIn", { code: me.organization.code })}</p>
        </>
      )}
    </>
  );
}
