// embed.js (spec 5.3, W31): the snippet an agency pastes. It finds its own script tag, builds the iframe from a valid key
// only, and sizes the frame from the form's height message, trusting no other window or origin.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const file = path.resolve(import.meta.dirname, "../../public/embed.js");
const source = readFileSync(file, "utf8");
const origin = "https://app.example";
const key = "AAAAAAAAAAAAAAAAAAAAAA" + "bbbbbbbbbbbbbbbb";

/** Pastes the snippet into the page as a browser would run it: its own script tag is the current script. */
function embed(formKey: string | null): HTMLScriptElement {
  const script = document.createElement("script");
  script.setAttribute("src", `${origin}/embed.js`);
  if (formKey !== null) script.setAttribute("data-form", formKey);
  document.body.append(script);
  Object.defineProperty(document, "currentScript", { value: script, configurable: true });
  window.eval(source);
  return script;
}

const frameOf = () => document.querySelector("iframe");

function heard(frame: HTMLIFrameElement, data: unknown, from: string = origin): void {
  window.dispatchEvent(new MessageEvent("message", { data, origin: from, source: frame.contentWindow }));
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  Reflect.deleteProperty(document, "currentScript");
});

describe("embed.js", () => {
  it("inserts the iframe after its script from a valid key", () => {
    const script = embed(key);
    const frame = frameOf();
    expect(frame).not.toBeNull();
    expect(script.nextElementSibling).toBe(frame);
    expect(frame?.getAttribute("src")).toBe(`${origin}/embed/${key}`);
    expect(frame?.title).toBe("Enquiry form");
    expect(frame?.getAttribute("loading")).toBe("lazy");
    expect(frame?.style.width).toBe("100%");
    expect(frame?.style.border).toMatch(/^(0|0px|medium)/);
  });

  it.each([null, "", "short", `${key}x`, `${key.slice(1)}!`, "../../evil"])("inserts nothing for the key %j", (bad) => {
    embed(bad);
    expect(frameOf()).toBeNull();
  });

  it("sets the height from the form's message, clamped to 200-4000", () => {
    embed(key);
    const frame = frameOf();
    if (frame === null) throw new Error("no frame");
    heard(frame, { type: "travel-crm-form:height", height: 912.4 });
    expect(frame.style.height).toBe("913px");
    heard(frame, { type: "travel-crm-form:height", height: 20 });
    expect(frame.style.height).toBe("200px");
    heard(frame, { type: "travel-crm-form:height", height: 99999 });
    expect(frame.style.height).toBe("4000px");
  });

  it("ignores another origin, another window, a wrong type and a height that is not a number", () => {
    embed(key);
    const frame = frameOf();
    if (frame === null) throw new Error("no frame");
    heard(frame, { type: "travel-crm-form:height", height: 700 });
    expect(frame.style.height).toBe("700px");
    heard(frame, { type: "travel-crm-form:height", height: 300 }, "https://evil.example");
    window.dispatchEvent(
      new MessageEvent("message", { data: { type: "travel-crm-form:height", height: 300 }, origin, source: window }),
    );
    heard(frame, { type: "something-else", height: 300 });
    heard(frame, { type: "travel-crm-form:height", height: "300" });
    heard(frame, { type: "travel-crm-form:height", height: Number.NaN });
    heard(frame, { type: "travel-crm-form:height", height: Infinity });
    heard(frame, null);
    expect(frame.style.height).toBe("700px");
  });

  it("is under 2 KB and has no dependencies", () => {
    expect(statSync(file).size).toBeLessThan(2048);
    expect(source).not.toMatch(/\b(import|require)\b/);
  });
});
