// A cheap token estimate (four characters a token) for budget checks.
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
