// Public API of @travel-crm/domain/package-pages: the agency's public package pages and the enquiries they take (release 7b). It
// sits above quotes, crm, departures and tasks; nothing below calls it. What a page shows is only what the agency published.
export { receiveEnquiryOnPackage, pageUnavailable, type PackageEnquiryServices } from "./enquiry.js";
export { departuresOf, pagesAreOn, publishedPackage, publishedPackages, type PublicPackageRow } from "./read.js";
export { publicPageSettingsOf, savePublicPageSettings } from "./settings.js";
