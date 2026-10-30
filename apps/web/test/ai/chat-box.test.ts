// Words handed to a chat's reply box from the quote write-up: the words and the AI draft they began as wait in the tab, are
// read back once by the box, and a stored value that isn't ours is ignored.
import { beforeEach, describe, expect, it } from "vitest";
import { forgetAiDraft, keepAiDraft, readAiDraft } from "@/ai/write-up/chat-box";
import { draftKey } from "@/inbox/forward-dialog";
import { keepTabValue, readTabValue } from "@/lib/tab-storage";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("the chat box hand-over", () => {
  it("keeps the words under the inbox's draft key and the AI draft beside them", () => {
    keepAiDraft("chat-1", { id: "draft-1", text: "Hello Rahul" });
    expect(readTabValue(draftKey("chat-1"))).toBe("Hello Rahul");
    expect(readAiDraft("chat-1")).toEqual({ id: "draft-1", text: "Hello Rahul" });
    expect(readAiDraft("chat-2")).toBeNull();
  });

  it("forgets the draft once it is sent or emptied", () => {
    keepAiDraft("chat-1", { id: "draft-1", text: "Hello" });
    forgetAiDraft("chat-1");
    expect(readAiDraft("chat-1")).toBeNull();
  });

  it("ignores a stored value that is not an AI draft", () => {
    keepTabValue("inbox.ai-draft.chat-1", "not json");
    expect(readAiDraft("chat-1")).toBeNull();
    keepTabValue("inbox.ai-draft.chat-1", JSON.stringify({ id: 4 }));
    expect(readAiDraft("chat-1")).toBeNull();
  });
});
