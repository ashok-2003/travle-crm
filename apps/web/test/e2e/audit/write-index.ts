// After every audit run (the config's globalTeardown): ${AUDIT_OUT}/index.md, one line per shot of each project, with
// the screen, the route it was taken on, who it was taken as and the project, from shot-list.ts and the routes
// shoot() noted. A shot no run has taken is listed as not shot, so a run split by --project or --grep ends with the
// whole picture.
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FullConfig } from "@playwright/test";
import { auditOut, ROUTES_FILE, shotNumber } from "./camera";
import { SHOTS } from "./shot-list";

async function routesOf(directory: string): Promise<Record<string, string>> {
  return readFile(path.join(directory, ROUTES_FILE), "utf8").then(
    (text) => JSON.parse(text) as Record<string, string>,
    () => ({}),
  );
}

export default async function writeIndex(config: FullConfig): Promise<void> {
  const out = auditOut();
  if (!existsSync(out)) return;
  const lines = [
    "# Visual audit: the shots",
    "",
    "One line per shot: the PNG, the screen, its route (ids as `<id>`), who it was taken as, and the project (phone",
    "390×844 at 2x, desktop 1440×900). A page taller than the window is shot with the window as tall as the page, so",
    "the sidebar and the bars sit at its edges. Every agency is a test agency, Sharma Travels; its logo is a stand-in.",
    "",
    "| Shot | Screen | Route | As | Project |",
    "| ---- | ------ | ----- | -- | ------- |",
  ];
  let missing = 0;
  for (const { name: project } of config.projects) {
    const routes = await routesOf(path.join(out, project));
    SHOTS.forEach((shot, index) => {
      if ("only" in shot && shot.only !== project) return;
      const file = `${shotNumber(index)}-${shot.name}.png`;
      const route = routes[shot.name];
      const taken = route !== undefined && existsSync(path.join(out, project, file));
      if (!taken) missing += 1;
      const link = taken ? `[${file}](${project}/${file})` : `**not shot:** ${file}`;
      lines.push(`| ${link} | ${shot.screen} | ${taken ? `\`${route}\`` : ""} | ${shot.as} | ${project} |`);
    });
  }
  lines.push("", missing === 0 ? "Every shot was taken." : `${String(missing)} shots were not taken.`, "");
  await writeFile(path.join(out, "index.md"), lines.join("\n"));
}
