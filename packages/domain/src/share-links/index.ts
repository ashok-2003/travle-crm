// Public API of the share-links module: links that open one record without signing in (spec 9.3).
export { forgetRecordShareLinks } from "./erasure.js";
export { notifySharerListener, type NotifySharerDependencies } from "./notify-sharer.js";
export {
  createShareLink,
  findShareLink,
  listShareLinks,
  recordShareLinkOpen,
  revokeShareLink,
  type NewShareLink,
  type OpenedShareLink,
  type SharedRecord,
  type ShareLinkVisitor,
} from "./share-links.js";
