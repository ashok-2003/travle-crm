// Public API of the documents module: issuing numbered documents and rendering their PDFs once (spec 9.3).
export { brandedSampleQuotation, SAMPLE_PREFIX, type SampleBranding } from "./branded-sample.js";
export { assertUsableLogo } from "./document-logo.js";
export { issueDocument, type IssueDocumentOptions } from "./issue-document.js";
export { getIssuedDocument } from "./issued-document-row.js";
export { listIssuedDocuments } from "./list-issued-documents.js";
export { renderIssuedDocumentListener, type RenderIssuedDocumentDependencies } from "./render-issued-document.js";
export { assertMayIssueSample, SAMPLES_PER_DAY } from "./sample-limit.js";
export { sampleQuotation, type SampleQuotation, type SampleQuotationLine } from "./sample-quotation.js";
export { documentsIssuedSince } from "./usage.js";
