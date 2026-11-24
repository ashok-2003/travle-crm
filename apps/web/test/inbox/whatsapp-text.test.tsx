// WhatsApp's formatting on screen: semantic elements, safe links, and never HTML built from the text.
import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WhatsAppText } from "@/inbox/whatsapp-text";

describe("WhatsAppText", () => {
  it("renders bold, italic, strike and code as elements", () => {
    const { container } = render(<WhatsAppText text="*a* _b_ ~c~ `d`" />);
    expect(container.querySelector("strong")?.textContent).toBe("a");
    expect(container.querySelector("em")?.textContent).toBe("b");
    expect(container.querySelector("s")?.textContent).toBe("c");
    expect(container.querySelector("code")?.textContent).toBe("d");
  });

  it("renders bullets and numbers as lists", () => {
    const { container } = render(<WhatsAppText text={"- one\n- two\n\n1. a"} />);
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.querySelectorAll("ol > li")).toHaveLength(1);
  });

  it("numbers each item as typed", () => {
    const { container } = render(<WhatsAppText text={"2. 5 people\n3. December"} />);
    expect([...container.querySelectorAll("ol > li")].map((item) => item.getAttribute("value"))).toEqual(["2", "3"]);
  });

  it("renders a quote and a code block", () => {
    const { container } = render(<WhatsAppText text={"> hi\n```x *y*```"} />);
    expect(container.querySelector("blockquote")?.textContent).toBe("hi");
    expect(container.querySelector("pre")?.textContent).toBe("x *y*");
  });

  it("opens links in a tab of their own without passing on where they came from", () => {
    render(<WhatsAppText text="see https://x.co/a" />);
    const link = screen.getByRole("link", { name: "https://x.co/a" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows HTML in the text as those characters", () => {
    const { container } = render(<WhatsAppText text="<b>x</b>" />);
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toBe("<b>x</b>");
  });

  it("keeps a bold run around a highlighted blank", () => {
    const { container } = render(<WhatsAppText text="*Hi {name}* pay {amount}" blanks />);
    const bold = container.querySelector("strong");
    if (bold === null) throw new Error("no bold run");
    expect(bold.textContent).toBe("Hi {name}");
    expect(within(bold).getByText("{name}")).toHaveClass("bg-status-attention-fill");
    expect(screen.getByText("{amount}")).toHaveClass("bg-status-attention-fill");
    expect(container.textContent).toBe("Hi {name} pay {amount}");
  });

  it("shows a blank as plain words when not asked to mark it", () => {
    const { container } = render(<WhatsAppText text="*Hi {name}*" />);
    expect(container.textContent).toBe("Hi {name}");
    expect(container.querySelector(".bg-status-attention-fill")).toBeNull();
  });

  it("shows braces in code and links exactly as typed, with no hidden characters", () => {
    const { container } = render(<WhatsAppText text={"```\n{id}\n```\nhttps://x.co/{id}"} />);
    expect(container.querySelector("pre")?.textContent).toBe("{id}");
    expect(screen.getByRole("link")).toHaveTextContent("https://x.co/{id}");
    expect(container.textContent).not.toMatch(/[\uE000\uE001]/);
  });

  it("highlights a blank in a fenced block and a link when asked", () => {
    const { container } = render(<WhatsAppText text={"```\n{id}\n```\nhttps://x.co/{id}"} blanks />);
    const pre = container.querySelector("pre");
    if (pre === null) throw new Error("no code block");
    expect(within(pre).getByText("{id}")).toHaveClass("bg-status-attention-fill");
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://x.co/{id}");
    expect(container.textContent).not.toMatch(/[\uE000\uE001]/);
  });

  it("lets a blank sit against a marker", () => {
    const { container } = render(<WhatsAppText text="{name}*bold* and *Hi*{name}" blanks />);
    expect([...container.querySelectorAll("strong")].map((bold) => bold.textContent)).toEqual(["bold", "Hi"]);
  });

  it("puts a trailing node on the last line of paragraphs, a list item, a quote, and below a code block", () => {
    const after = <i data-testid="after" />;
    const place = (text: string) => {
      const { container, unmount } = render(<WhatsAppText text={text} after={after} />);
      const spot = screen.getByTestId("after").parentElement?.tagName;
      unmount();
      return [spot, container.querySelector("p")] as const;
    };
    expect(render(<WhatsAppText text={"a\n\nb"} after={after} />).container.querySelector("p")).toBeNull();
    cleanup();
    expect(place("- a\n- b")[0]).toBe("LI");
    expect(place("> q")[0]).toBe("BLOCKQUOTE");
    expect(place("```x```")[0]).toBe("DIV");
    expect(place("text\n- a\nmore")[0]).toBe("P");
  });
});
