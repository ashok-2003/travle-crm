// Which agent answers an agency's WhatsApp chats: the lite agent, the natural one or the one agent. Platform staff choose it.
export const agentKinds = ["lite", "natural", "one"] as const;
export type AgentKind = (typeof agentKinds)[number];
