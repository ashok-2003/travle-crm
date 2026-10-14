// `pnpm --filter @travel-crm/brand build`: writes the icons into dist/icons, or into the folder given as an argument.
import path from "node:path";
import { generateIcons } from "./render-icons.js";

const outputDirectory = process.argv[2] ?? path.join(import.meta.dirname, "../dist/icons");
const written = await generateIcons(outputDirectory);
console.log(`Wrote ${String(written.length)} icons to ${outputDirectory}`);
