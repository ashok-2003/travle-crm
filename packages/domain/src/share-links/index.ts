// Public API of the share-links module: links that open one record without signing in (spec 9.3).
export {
  createShareLink,
  listShareLinks,
  openShareLink,
  revokeShareLink,
  type NewShareLink,
  type OpenedShareLink,
  type SharedRecord,
  type ShareLinkVisitor,
} from "./share-links.js";
