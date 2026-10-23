// The refusals the Meta screens show (spec 6.3): each reason has a sentence of its own in errors.json.
import { DomainError } from "../kernel/index.js";

export const notConfigured = () =>
  new DomainError("CONFLICT", "META_NOT_CONFIGURED", "Facebook and Instagram lead ads are not set up on this server");
export const notInDemo = () =>
  new DomainError("CONFLICT", "META_NOT_IN_DEMO", "Facebook and Instagram lead ads are not available in the demo");
export const loginFailed = () =>
  new DomainError("VALIDATION", "META_LOGIN_FAILED", "Facebook did not complete the login");
export const permissionMissing = () =>
  new DomainError("CONFLICT", "META_PERMISSION_MISSING", "Facebook did not give permission to read lead forms");
export const pageNotAllowed = () =>
  new DomainError("FORBIDDEN", "META_PAGE_NOT_ALLOWED", "You cannot advertise on this Page");
export const pageTaken = () =>
  new DomainError("CONFLICT", "META_PAGE_TAKEN", "This Page is already connected elsewhere");
export const pageLimit = () =>
  new DomainError("LIMIT_REACHED", "META_PAGE_LIMIT", "This organization has the most Pages it may connect");
export const formNotFound = () => new DomainError("NOT_FOUND", "META_FORM_NOT_FOUND", "No such lead form");
export const unavailable = () =>
  new DomainError("CONFLICT", "META_UNAVAILABLE", "Facebook did not answer; try again in a moment");
export const checkedJustNow = () => new DomainError("CONFLICT", "META_BUSY", "The Page was checked a moment ago");
