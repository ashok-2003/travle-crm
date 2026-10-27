// Public API of @travel-crm/domain/reports: reports and analytics, and each staff member's performance (sales
// execution). It sits above crm, quotes, inbox and tasks, which it reads; nothing below calls it.
export { salesReportOf, staffReportOf, type SalesReportFigures, type StaffReportFigures } from "./report.js";
