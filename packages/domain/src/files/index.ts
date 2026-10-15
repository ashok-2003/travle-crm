// Public API of the files module: files attached to records, in object storage (spec 9.2).
export type { DownloadLink, FilesDependencies, GeneratedFile } from "./dependencies.js";
export { createFiles, type Files } from "./files.js";
export {
  deleteRecordFiles,
  deleteStoredFiles,
  exportedFiles,
  storedFileKeys,
  type ExportedFile,
  type FileRecord,
} from "./purge.js";
export { bytesStored } from "./uploads.js";
