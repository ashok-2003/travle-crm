// The in-memory tool agent (ruling P9): the LangGraph agent's turn as a plain loop, for the domain's tests. It shares
// the model, the tool runner and the ends with the LangGraph agent, and counts steps as LangGraph does, so the contract
// test holds the two to the same ends.
import type { BaseMessage } from "@langchain/core/messages";
import { toLangChain } from "./messages.js";
import { answered, callsOf, endsRun, failed, modelForRun, nextAnswer, toolMessages } from "./tool-calls.js";
import type { ToolAgent, ToolAgentEnd, ToolAgentInput } from "./tool-agent.js";

/** LangGraph's default recursion limit. */
const DEFAULT_RECURSION_LIMIT = 25;

async function run(input: ToolAgentInput): Promise<ToolAgentEnd> {
  const model = modelForRun(input);
  const limit = input.recursionLimit ?? DEFAULT_RECURSION_LIMIT;
  const messages: BaseMessage[] = input.messages.map(toLangChain);
  try {
    // LangGraph's count: every node run is a step, the model's answer and then its calls' results.
    for (let step = 1; step <= limit; step += 2) {
      const answer = await nextAnswer(model, input, messages);
      messages.push(answer);
      // LangGraph ends a run at its limit before it looks at the answer, so words on the last step end it `steps` too.
      if (step === limit) break;
      if (callsOf(answer).length === 0) return answered(messages, model.calls);
      messages.push(...(await toolMessages(input, answer)));
      if (endsRun(input, messages)) return answered(messages, model.calls);
    }
    return { end: "steps", calls: model.calls };
  } catch (error) {
    return failed(error, model.calls);
  }
}

export function createMemoryToolAgent(): ToolAgent {
  return { run };
}
