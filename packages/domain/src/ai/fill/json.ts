// Reads the JSON object a model answered with.
/** The JSON object in the model's text: it may wrap it in a fence or add a word before it. */
export function jsonObjectIn(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
