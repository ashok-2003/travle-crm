"use client";

// The Inbox's settings menu in the chats' bar (inbox revamp spec, part 1 items 5 and 6): two switches, Sound and Desktop
// notifications, both off until the member turns them on and kept in this browser, which alert on every page of the app
// while the browser has it open; the browser's permission for
// notifications is asked only as that switch is turned on, and a browser that blocked them says so; one that can't show
// them at all has no such switch. Then the keyboard shortcuts, listed in a dialog.
import { BellIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Details } from "@/components/details";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useMe } from "@/session/me-context";
import { alertIsOn, keepAlert, notificationPermission, playChime, readySound, type AlertKind } from "./inbox-alerts";

/** The keys the Inbox answers (use-inbox-keys.ts and the reply box), as the dialog lists them: each with `<what>Keys`. */
const shortcuts = ["nextChat", "nextChatTyping", "search", "closePanel", "send", "newLine"] as const;

function AlertSwitch({
  kind,
  on,
  onChange,
  hint,
  disabled = false,
}: {
  kind: AlertKind;
  on: boolean;
  onChange: (on: boolean) => void;
  hint: string;
  disabled?: boolean;
}) {
  const t = useTranslations("inbox.alerts");
  const id = `inbox-alert-${kind}`;
  return (
    <Item size="sm" className="px-0">
      <ItemContent>
        <ItemTitle>
          <Label htmlFor={id}>{t(kind)}</Label>
        </ItemTitle>
        <ItemDescription id={`${id}-hint`}>{hint}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch id={id} aria-describedby={`${id}-hint`} checked={on} disabled={disabled} onCheckedChange={onChange} />
      </ItemActions>
    </Item>
  );
}

export function AlertsMenu() {
  const t = useTranslations("inbox.alerts");
  const tKeys = useTranslations("inbox.keys");
  const menuButton = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const userId = useMe().user.id;
  const [sound, setSound] = useState(() => alertIsOn(userId, "sound"));
  const [permission, setPermission] = useState(notificationPermission);
  const [desktop, setDesktop] = useState(() => alertIsOn(userId, "desktop") && notificationPermission() === "granted");

  const changeSound = (on: boolean) => {
    setSound(on);
    keepAlert(userId, "sound", on);
    // Inside the click: the browser lets the page make sounds from now on, and this one says what it will sound like.
    if (on) void readySound()?.resume().then(playChime);
  };
  const changeDesktop = async (on: boolean) => {
    if (!on) {
      setDesktop(false);
      keepAlert(userId, "desktop", false);
      return;
    }
    const answer = notificationPermission() === "default" ? await Notification.requestPermission() : permission;
    setPermission(answer);
    setDesktop(answer === "granted");
    keepAlert(userId, "desktop", answer === "granted");
  };
  const desktopHint = permission === "denied" ? t("desktopBlocked") : t("desktopHint");

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button ref={menuButton} type="button" variant="ghost" size="icon" aria-label={t("open")}>
            <BellIcon aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-80 flex-col gap-2">
          <div className="flex flex-col gap-1">
            <p className="text-label font-medium">{t("title")}</p>
            <p className="text-caption text-muted-foreground">{t("everywhere")}</p>
          </div>
          <ItemGroup>
            <AlertSwitch kind="sound" on={sound} onChange={changeSound} hint={t("soundHint")} />
            {permission !== "unsupported" && (
              <AlertSwitch
                kind="desktop"
                on={desktop}
                onChange={(on) => void changeDesktop(on)}
                hint={desktopHint}
                disabled={permission === "denied" && !desktop}
              />
            )}
          </ItemGroup>
          <Separator />
          <Button
            type="button"
            variant="ghost"
            className="justify-start"
            onClick={() => {
              setMenuOpen(false);
              setKeysOpen(true);
            }}
          >
            {t("shortcuts")}
          </Button>
        </PopoverContent>
      </Popover>
      <ResponsiveDialog
        open={keysOpen}
        onOpenChange={setKeysOpen}
        title={tKeys("title")}
        description={tKeys("intro")}
        returnFocusTo={menuButton}
      >
        <Details rows={shortcuts.map((what) => ({ label: tKeys(what), value: <kbd>{tKeys(`${what}Keys`)}</kbd> }))} />
      </ResponsiveDialog>
    </>
  );
}
