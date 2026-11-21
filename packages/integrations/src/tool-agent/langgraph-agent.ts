// The tool agent on LangGraph (ruling P2): a two-node StateGraph built for each run, `agent` (the model, over our AI
// port) and `tools` (the answer's calls), looping until the model answers in words or LangGraph's step limit ends the
// run. Not createReactAgent (deprecated in LangGraph 1) nor ToolNode, which runs an answer's calls at once: each tool
// stages in the model's order.
import { END, GraphRecursionError, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { toLangChain } from "./messages.js";
import { answered, callsOf, endsRun, failed, nextAnswer, modelForRun, toolMessages } from "./tool-calls.js";
import type { ToolAgent, ToolAgentEnd, ToolAgentInput } from "./tool-agent.js";

async function run(input: ToolAgentInput): Promise<ToolAgentEnd> {
  const model = modelForRun(input);
  const graph = new StateGraph(MessagesAnnotation)
    .addNode("agent", async ({ messages }) => ({ messages: [await nextAnswer(model, input, messages)] }))
    .addNode("tools", async ({ messages }) => ({ messages: await toolMessages(input, messages.at(-1)) }))
    .addEdge(START, "agent")
    .addConditionalEdges("agent", ({ messages }) => (callsOf(messages.at(-1)).length > 0 ? "tools" : END), [
      "tools",
      END,
    ])
    // A call of an endsRun tool that went through ends the run: asking the model again only gets an empty answer.
    .addConditionalEdges("tools", ({ messages }) => (endsRun(input, messages) ? END : "agent"), ["agent", END])
    .compile();
  try {
    const { messages } = await graph.invoke(
      { messages: input.messages.map(toLangChain) },
      input.recursionLimit === undefined ? {} : { recursionLimit: input.recursionLimit },
    );
    return answered(messages, model.calls);
  } catch (error) {
    if (error instanceof GraphRecursionError) return { end: "steps", calls: model.calls };
    return failed(error, model.calls);
  }
}

export function createLangGraphToolAgent(): ToolAgent {
  return { run };
}
