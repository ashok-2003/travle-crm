// A small valid PDF with one line of text per page, built by hand, for the tests that read a PDF's words (rate sheets).
export function tinyPdf(pages: readonly (readonly string[])[]): Uint8Array {
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${String(id)} 0 R`).join(" ")}] /Count ${String(pages.length)} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((lines, index) => {
    const id = 4 + index * 2;
    const stream = `BT /F1 12 Tf 14 TL 50 700 Td ${lines.map((line) => `(${line}) Tj T*`).join(" ")} ET`;
    objects[id] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${String(id + 1)} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
    objects[id + 1] = `<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream`;
  });
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    const object = objects[id];
    if (object === undefined) continue;
    offsets[id] = body.length;
    body += `${String(id)} 0 obj\n${object}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${String(objects.length)}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) body += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${String(objects.length)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
