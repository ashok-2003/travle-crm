"use client";

// The AI agent's Overview tab, the page's full width: while setup holds it back, the banner that says what is left; then
// its last 24 hours on top, and what needs a person under them.
import { LastDay } from "./last-day";
import { NeedsYou } from "./needs-you";
import { SetupBanner } from "./setup-banner";

export function AgentOverview() {
  return (
    <div className="flex flex-col gap-6">
      <SetupBanner />
      <LastDay />
      <NeedsYou />
    </div>
  );
}
