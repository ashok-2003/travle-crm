// Public API of the documents module: issuing numbered documents and rendering their PDFs once (spec 9.3).
export { brandedSampleQuotation, SAMPLE_PREFIX, type SampleBranding } from "./branded-sample.js";
export { issueDocument, type IssueDocumentOptions } from "./issue-document.js";
export { getIssuedDocument } from "./issued-document-row.js";
export { listIssuedDocuments } from "./list-issued-documents.js";
export { renderIssuedDocumentListener, type RenderIssuedDocumentDependencies } from "./render-issued-document.js";
export { sampleQuotation, type SampleQuotation, type SampleQuotationLine } from "./sample-quotation.js";
export { documentsIssuedSince } from "./usage.js";
