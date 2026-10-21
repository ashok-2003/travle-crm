// Which import each signed upload is for (W3): ImportFileStep's upload knows only its attachment, so confirming it
// looks the import up here, and an attachment no import was started for is an error rather than a confirm("").
export function uploadedImports() {
  const importOf = new Map<string, string>();
  return {
    remember(attachmentId: string, importId: string): void {
      importOf.set(attachmentId, importId);
    },
    importFor(attachmentId: string): string {
      const importId = importOf.get(attachmentId);
      if (importId === undefined) throw new Error("No import was started for this upload");
      return importId;
    },
  };
}
