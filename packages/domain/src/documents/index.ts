// Public API of the documents module: issuing numbered documents and rendering their PDFs once (spec 9.3).
export { issueDocument, type IssueDocumentOptions } from "./issue-document.js";
export { getIssuedDocument } from "./issued-document-row.js";
export { renderIssuedDocumentListener, type RenderIssuedDocumentDependencies } from "./render-issued-document.js";
