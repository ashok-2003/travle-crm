// A LangChain chat model over our AI port (ruling R1), for LangGraph to drive. Every call goes through the caller's
// `AgentModelCall`, so OpenRouter's model list, the thought signatures, Langfuse's generations and the month's count all
// stay ours. The first answer's model is pinned for the rest of the run (unless the request names one), and a cut-off
// answer without calls is asked once more, thinking as little as it may (ruling P7).
import { BaseChatModel, type BindToolsInput } from "@langchain/core/language_models/chat_models";
import {
  AIMessage,
  type BaseMessage,
  type StandardMessageStructure,
  type UsageMetadata,
} from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import type { AiFailure, AiRequest, AiResult, AiTool } from "../ai/ai-model.js";
import { assistantFields, boundTool, fromLangChain } from "./messages.js";
import type { AgentModelCall, ToolAgentInput } from "./tool-agent.js";

/** A model call that gave no answer: the port's reason, or "limit" when the month has none left. */
export class AgentModelFailure extends Error {
  readonly reason: AiFailure | "limit";

  constructor(reason: AiFailure | "limit") {
    super(`The model gave no answer: ${reason}`);
    this.name = "AgentModelFailure";
    this.reason = reason;
  }
}

type Answer = Extract<AiResult, { ok: true }>;

/** What a model and the copies `bindTools` makes of it share: the port calls made, and the model pinned. */
interface Shared {
  calls: number;
  model: string | null;
}

const cutOff = (answer: Answer): boolean => answer.finishReason === "length" && (answer.toolCalls ?? []).length === 0;

function usageOf(answer: Answer): UsageMetadata {
  return {
    input_tokens: answer.inputTokens,
    output_tokens: answer.outputTokens,
    total_tokens: answer.inputTokens + answer.outputTokens,
    ...(answer.cachedTokens === undefined ? {} : { input_token_details: { cache_read: answer.cachedTokens } }),
    ...(answer.reasoningTokens === undefined ? {} : { output_token_details: { reasoning: answer.reasoningTokens } }),
  };
}

/** The answer as LangGraph keeps it: its calls and reasoning as `toLangChain` writes them, its usage and its model. */
function answerMessage(answer: Answer): BaseMessage {
  const calls = answer.toolCalls ?? [];
  const fields = assistantFields({
    role: "assistant",
    content: answer.text,
    ...(calls.length === 0 ? {} : { toolCalls: calls }),
    ...(answer.reasoningDetails === undefined ? {} : { reasoningDetails: answer.reasoningDetails }),
  });
  // The standard structure: the default one types usage_metadata as never under our strict compiler settings.
  return new AIMessage<StandardMessageStructure>({
    ...fields,
    usage_metadata: usageOf(answer),
    response_metadata: {
      model: answer.model,
      ...(answer.finishReason === undefined ? {} : { finishReason: answer.finishReason }),
    },
  });
}

export class PortChatModel extends BaseChatModel {
  readonly #call: AgentModelCall;
  readonly #request: ToolAgentInput["request"];
  #tools: readonly AiTool[] = [];
  #shared: Shared = { calls: 0, model: null };

  constructor(fields: { call: AgentModelCall; request: ToolAgentInput["request"] }) {
    // "v0" whatever LC_OUTPUT_VERSION says: an answer's content stays the model's words, as fromLangChain reads them.
    super({ outputVersion: "v0" });
    this.#call = fields.call;
    this.#request = fields.request;
  }

  override _llmType(): string {
    return "travel-crm-ai-port";
  }

  /** The port calls made by this model and its bound copies, a cut-off answer's retry included. */
  get calls(): number {
    return this.#shared.calls;
  }

  /** A copy that offers these tools (our `AiTool`s or OpenAI function definitions), sharing the pin and the count. */
  override bindTools(tools: BindToolsInput[]): PortChatModel {
    const bound = new PortChatModel({ call: this.#call, request: this.#request });
    bound.#tools = tools.map(boundTool);
    bound.#shared = this.#shared;
    return bound;
  }

  override async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const request: AiRequest = {
      ...this.#request,
      messages: messages.map(fromLangChain),
      // No tools and no tool choice on a call without tools, as natural's requests (its pre-flight #5).
      ...(this.#tools.length === 0 ? {} : { tools: this.#tools, toolChoice: "auto" as const }),
    };
    let answer = await this.#ask(request);
    if (cutOff(answer)) {
      answer = await this.#ask({ ...request, reasoning: { effort: "minimal" } });
      // Cut off twice: no answer to give.
      if (cutOff(answer)) throw new AgentModelFailure("unavailable");
    }
    return { generations: [{ text: answer.text, message: answerMessage(answer) }] };
  }

  /** One port call, naming the pinned model; the first answer pins its own. */
  async #ask(request: AiRequest): Promise<Answer> {
    const pinned = this.#request.model === undefined ? this.#shared.model : null;
    this.#shared.calls += 1;
    const result = await this.#call(pinned === null ? request : { ...request, model: pinned });
    if (!result.ok) throw new AgentModelFailure(result.reason);
    this.#shared.model ??= result.model;
    return result;
  }
}
