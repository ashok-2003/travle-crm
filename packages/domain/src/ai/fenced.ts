// Keeps a data fence from being closed by the words inside it, for every prompt that quotes a customer or an agency.
export const fenced = (text: string) => text.replaceAll("<", "‹").replaceAll(">", "›");
