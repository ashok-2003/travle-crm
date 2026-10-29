"use client";

// Coming back from a call (release 5, scope 3.4): after the person taps Call on a phone and the dialler takes over,
// the app is visible again and asks "How did the call go?" for that lead, if it was within 30 minutes. Mounted once
// in the app shell, so it works from any screen the person returns to.
import { useEffect, useState } from "react";
import { CallNoteDialog } from "./call-note-dialog";
import { takePendingCall, type PendingCall } from "./pending-call";

export function CallReturn() {
  const [call, setCall] = useState<PendingCall | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const pending = takePendingCall();
      if (pending === null) return;
      setCall(pending);
      setOpen(true);
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  if (call === null) return null;
  return <CallNoteDialog leadId={call.leadId} name={call.name} held={{ open, setOpen }} />;
}
