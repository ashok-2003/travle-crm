// attachments.*: files on any record (spec 9.2): presigned uploads the browser PUTs straight to storage, their
// confirmation, the list of a record's files and their downloads. File bytes never pass through the api.
import { router } from "../trpc.js";

export const attachmentsRouter = router({});
