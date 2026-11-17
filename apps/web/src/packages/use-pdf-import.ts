"use client";

// New package from PDFs: each brochure is put straight into storage as one of the AI's documents, read by the worker,
// then every trip in it is made a group package. One file at a time, in the order chosen; the state lives with the
// dialog, so closing nothing loses a result.
import { MAX_AI_KNOWLEDGE_BYTES, MAX_PDF_IMPORTS, type ImportedPdf } from "@travel-crm/contracts/ai";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { uploadFile } from "@/files/upload";

export type PdfStep = "waiting" | "uploading" | "reading" | "making" | "done" | "failed";

export interface PdfImport {
  key: string;
  fileName: string;
  step: PdfStep;
  /** Why a file was not taken before any request: not a PDF, or too large. */
  problem: "wrongType" | "tooLarge" | "unreadable" | null;
  result: ImportedPdf | null;
  error: unknown;
}

const PDF = "application/pdf";
/** How long the worker gets to read one PDF, asked every two seconds. */
const READ_TRIES = 60;
const READ_EVERY_MS = 2000;
const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const titleOf = (fileName: string) =>
  fileName
    .replace(/\.pdf$/i, "")
    .trim()
    .slice(0, 120) || "Brochure";

export function usePdfImport() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const [imports, setImports] = useState<PdfImport[]>([]);
  const [running, setRunning] = useState(false);

  const update = (key: string, change: Partial<PdfImport>) => {
    setImports((all) => all.map((one) => (one.key === key ? { ...one, ...change } : one)));
  };

  /** Uploads, waits for the read, and makes the packages of one file; its outcome lands on its row. */
  const importOne = async (key: string, file: File) => {
    update(key, { step: "uploading" });
    const slot = await client.ai.packageDrafts.requestPdf.mutate({
      title: titleOf(file.name),
      fileName: file.name.slice(0, 200),
      contentType: PDF,
      sizeBytes: file.size,
    });
    await uploadFile(slot.upload, file);
    await client.ai.packageDrafts.confirmPdf.mutate({ knowledgeId: slot.knowledgeId, attachmentId: slot.attachmentId });
    update(key, { step: "reading" });
    for (let tries = 0; ; tries += 1) {
      await wait(READ_EVERY_MS);
      const [state] = await client.ai.packageDrafts.pdfStates.query({ knowledgeIds: [slot.knowledgeId] });
      if (state?.status === "ready") break;
      if (state?.status === "failed" || tries >= READ_TRIES) {
        update(key, { step: "failed", problem: "unreadable" });
        return;
      }
    }
    update(key, { step: "making" });
    const result = await client.ai.packageDrafts.importPdf.mutate({ knowledgeId: slot.knowledgeId });
    update(key, { step: "done", result });
  };

  const start = async (files: readonly File[]) => {
    const chosen = files.slice(0, MAX_PDF_IMPORTS).map((file, index) => {
      const problem: PdfImport["problem"] =
        file.type !== PDF ? "wrongType" : file.size > MAX_AI_KNOWLEDGE_BYTES ? "tooLarge" : null;
      const row: PdfImport = {
        key: `${String(Date.now())}-${String(index)}`,
        fileName: file.name,
        step: "waiting",
        problem,
        result: null,
        error: null,
      };
      return { file, row };
    });
    setImports(chosen.map(({ row }) => (row.problem === null ? row : { ...row, step: "failed" })));
    setRunning(true);
    try {
      for (const { file, row } of chosen) {
        if (row.problem !== null) continue;
        try {
          await importOne(row.key, file);
        } catch (error) {
          update(row.key, { step: "failed", error });
        }
      }
    } finally {
      await queryClient.invalidateQueries({ queryKey: trpc.quotes.packages.pathKey() });
      await queryClient.invalidateQueries({ queryKey: trpc.packages.pathKey() });
      setRunning(false);
    }
  };

  return {
    imports,
    running,
    start,
    clear: () => {
      setImports([]);
    },
  };
}
