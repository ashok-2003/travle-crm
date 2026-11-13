// The console's view of the lite WhatsApp agent, for super admins only: its prompt library.
import { aiPromptLibrary } from "@travel-crm/contracts/platform";
import * as domain from "@travel-crm/domain/platform";
import { superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const aiTransparencyRouter = platformT.router({
  /** Every fixed prompt piece with its version and text, and what each of the two model calls is given. */
  prompts: superAdminProcedure.output(aiPromptLibrary).query(() => domain.getAiPromptLibrary()),
});
