// tripKits.*: trip details (sales inbox): each trip's words, files and keywords, set up in Settings, WhatsApp by the Owner
// and Admins (inbox:templates, as the automatic answers are), listed for anyone in the inbox, and sent to a chat by whoever
// may reply there (inbox:reply).
import {
  createTripKitInput,
  requestTripKitUploadInput,
  sendTripKitInput,
  tripKitCreated,
  tripKitFileInput,
  tripKitIdInput,
  tripKitList,
  tripKitSent,
  tripKitUploadSlot,
  updateTripKitInput,
} from "@travel-crm/contracts/inbox";
import {
  confirmTripKitUpload,
  createTripKit,
  deleteTripKit,
  listTripKits,
  removeTripKitFile,
  requestTripKitUpload,
  sendTripKit,
  updateTripKit,
} from "@travel-crm/domain/inbox";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const reader = orgProcedure.requires("inbox:view");
const replier = orgProcedure.requires("inbox:view", "inbox:reply");
const curator = orgProcedure.requires("inbox:view", "inbox:templates");

export const tripKitsRouter = router({
  list: reader.output(tripKitList).query(({ ctx }) => listTripKits(ctx, ctx.member)),

  create: curator
    .input(createTripKitInput)
    .output(tripKitCreated)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => createTripKit(tx, ctx.member, input)),
    ),

  update: curator
    .input(updateTripKitInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => updateTripKit(tx, ctx.member, input)),
    ),

  delete: curator
    .input(tripKitIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => deleteTripKit(tx, ctx.member, input.tripKitId)),
    ),

  /** Step one of adding a file: where the browser puts it. */
  requestUpload: curator
    .input(requestTripKitUploadInput)
    .output(tripKitUploadSlot)
    .mutation(({ ctx, input }) => requestTripKitUpload(ctx, ctx.member, input)),

  /** Step two: the file is stored, and the trip holds it. */
  confirmUpload: curator
    .input(tripKitFileInput)
    .mutation(({ ctx, input }) => confirmTripKitUpload(ctx, ctx.member, input)),

  removeFile: curator.input(tripKitFileInput).mutation(({ ctx, input }) => removeTripKitFile(ctx, ctx.member, input)),

  /** Sends a trip's words and files to a chat now, each a message of its own. */
  send: replier
    .input(sendTripKitInput)
    .output(tripKitSent)
    .mutation(({ ctx, input }) =>
      sendTripKit(ctx, ctx.member, input, { whatsappConfigured: ctx.whatsappConfigured }, new Date()),
    ),
});
