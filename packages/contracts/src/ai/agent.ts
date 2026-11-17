// Which agent answers an agency's WhatsApp chats: the lite agent or the natural one. Platform staff choose it.
export const agentKinds = ["lite", "natural"] as const;
export type AgentKind = (typeof agentKinds)[number];
