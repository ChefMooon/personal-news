import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseReleaseNotes } from "../../../../shared/release-notes-markdown.mjs";
import type { Inline, ReleaseNotes } from "../../../../shared/release-notes-markdown.mjs";
import { expandCaseInput } from "../../../../shared/release-notes-markdown.corpus.mjs";
import { IPC } from "../../../../shared/ipc-types";
import { ReleaseNotesView } from "../ReleaseNotesView";
import {
  getSafeExternalHref,
  hasReleaseNotesContent,
} from "../../lib/release-notes";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const casesPath = new URL(
  "../../../../shared/__tests__/fixtures/release-notes-md-v1/cases.json",
  import.meta.url,
);
const cases = JSON.parse(readFileSync(casesPath, "utf8")).cases as Array<{
  id: string;
  input: string;
  valid: boolean;
}>;
const allowedTags = new Set([
  "div",
  "h4",
  "p",
  "ul",
  "li",
  "strong",
  "em",
  "code",
  "a",
  "span",
]);

function linksIn(inline: Inline[] | undefined): number {
  if (!Array.isArray(inline)) return 0;
  return inline.reduce((sum, item) => {
    if (!item || typeof item !== "object") return sum;
    if (item.type === "link") return sum + 1 + linksIn(item.children);
    if (item.type === "bold" || item.type === "italic") {
      return sum + linksIn(item.children);
    }
    return sum;
  }, 0);
}

function linkCount(notes: ReleaseNotes): number {
  return notes.sections.reduce(
    (sectionTotal, section) =>
      sectionTotal +
      section.blocks.reduce((blockTotal, block) => {
        if (block.type === "paragraph") return blockTotal + linksIn(block.inline);
        return (
          blockTotal +
          block.items.reduce(
            (itemTotal, item) =>
              itemTotal + linksIn(item.inline) +
              item.children.reduce(
                (childTotal, child) => childTotal + linksIn(child.inline),
                0,
              ),
            0,
          )
        );
      }, 0),
    0,
  );
}

function tagsIn(markup: string): string[] {
  return [...markup.matchAll(/<\/?([a-z][a-z0-9]*)\b/gi)].map((match) =>
    match[1].toLowerCase(),
  );
}

describe("ReleaseNotesView corpus rendering", () => {
  for (const testCase of cases) {
    if (testCase.valid) {
      it(`renders valid corpus case ${testCase.id}`, () => {
        const input = expandCaseInput(testCase);
        const result = parseReleaseNotes(input);
        expect(result.valid).toBe(true);
        const markup = renderToStaticMarkup(
          <ReleaseNotesView notes={result.notes} />,
        );
        expect(tagsIn(markup).every((tag) => allowedTags.has(tag))).toBe(true);
        expect([...markup.matchAll(/\bhref="([^"]*)"/g)].every((match) =>
          match[1].startsWith("https://"),
        )).toBe(true);
        expect([...markup.matchAll(/<a\b/g)]).toHaveLength(
          linkCount(result.notes),
        );
        const countCode = (inline: Inline[]): number =>
          inline.reduce((sum, item) => {
            if (item.type === "code") return sum + 1;
            if (item.type === "bold" || item.type === "italic" || item.type === "link") {
              return sum + countCode(item.children);
            }
            return sum;
          }, 0);
        const expectedCode = result.notes.sections.reduce(
          (sum, section) =>
            sum + section.blocks.reduce((blockSum, block) => {
              if (block.type === "paragraph") return blockSum + countCode(block.inline);
              return blockSum + block.items.reduce(
                (itemSum, item) => itemSum + countCode(item.inline) +
                  item.children.reduce((childSum, child) => childSum + countCode(child.inline), 0),
                0,
              );
            }, 0),
          0,
        );
        expect([...markup.matchAll(/<code\b/g)]).toHaveLength(expectedCode);
      });
    } else {
      it(`uses escaped fallback for invalid corpus case ${testCase.id}`, () => {
        const input = expandCaseInput(testCase);
        expect(parseReleaseNotes(input).valid).toBe(false);
        const markup = renderToStaticMarkup(
          <ReleaseNotesView
            notes={{ sections: [], fallbackText: input }}
          />,
        );
        expect(tagsIn(markup).every((tag) => ["div", "p"].includes(tag))).toBe(
          true,
        );
        expect(markup).not.toMatch(/<script|<img|<b(?:\s|>)/i);
        expect(markup).toContain("whitespace-pre-wrap");
        const escaped = input
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#x27;");
        expect(markup).toContain(escaped);
      });
    }
  }
});

describe("ReleaseNotesView safety and interaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders hostile links as escaped text", () => {
    const unsafe = [
      "javascript:alert(1)",
      "http://example.com",
      "data:text/html,x",
      "mailto:a@example.com",
      "https://user:pass@example.com/",
      `https://example.com/${"x".repeat(2048)}`,
      42,
    ];
    const notes: ReleaseNotes = {
      sections: [
        {
          heading: null,
          blocks: [
            {
              type: "list",
              items: unsafe.map((href) => ({
                inline: [
                  { type: "link", href, children: [{ type: "text", value: "<img src=x onerror=1>" }] },
                ] as unknown as Inline[],
                children: [],
              })),
            },
          ],
        },
      ],
    };
    const markup = renderToStaticMarkup(<ReleaseNotesView notes={notes} />);
    expect(markup).not.toContain("<a");
    expect(markup).not.toContain("<img");
    expect(markup).toContain("&lt;img src=x onerror=1&gt;");
  });

  it("tolerates malformed note shapes without claiming content", () => {
    expect(hasReleaseNotesContent(null)).toBe(false);
    expect(hasReleaseNotesContent(undefined)).toBe(false);
    expect(
      hasReleaseNotesContent({ sections: [{ items: ["old shape"] }] } as never),
    ).toBe(false);
    expect(
      hasReleaseNotesContent({ sections: [{ blocks: null }, null] } as never),
    ).toBe(false);
    expect(() =>
      renderToStaticMarkup(
        <ReleaseNotesView notes={{ sections: [{ blocks: null } as never] }} />,
      ),
    ).not.toThrow();
  });

  it("only accepts safe HTTPS URLs within the limit", () => {
    expect(getSafeExternalHref("https://example.com/path")).toBe(
      "https://example.com/path",
    );
    for (const value of [
      "https://user@example.com",
      "https://example.com/a b",
      "https://example.com/\"x",
      `https://example.com/${"x".repeat(2048)}`,
      "http://example.com",
    ]) {
      expect(getSafeExternalHref(value)).toBeNull();
    }
    expect(getSafeExternalHref(42)).toBeNull();
  });

  it("opens links through shell IPC and reports failures", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { api: { invoke } },
    });
    const notes: ReleaseNotes = {
      sections: [
        {
          heading: null,
          blocks: [
            {
              type: "paragraph",
              inline: [
                { type: "link", href: "https://example.com", children: [{ type: "text", value: "Example" }] },
              ],
            },
          ],
        },
      ],
    };
    const element = ReleaseNotesView({ notes });
    const anchors: React.ReactElement[] = [];
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (!React.isValidElement(node)) return;
      if (node.type === "a") anchors.push(node);
      visit((node.props as { children?: unknown }).children);
    };
    visit(element);
    expect(anchors).toHaveLength(1);
    const anchor = anchors[0];
    expect(anchor.props).toMatchObject({
      rel: "noopener noreferrer",
      title: "https://example.com",
      href: "https://example.com",
    });
    const preventDefault = vi.fn();
    anchor.props.onClick({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith(
      IPC.SHELL_OPEN_EXTERNAL,
      "https://example.com",
    );
    await Promise.resolve();

    const { toast } = await import("sonner");
    // The error text (which may contain the URL) is never echoed.
    invoke.mockRejectedValueOnce(
      new Error("Could not open https://example.com"),
    );
    anchor.props.onClick({ preventDefault: vi.fn() });
    await Promise.resolve();
    expect(toast.error).toHaveBeenLastCalledWith(
      "The link could not be opened.",
    );

    invoke.mockRejectedValueOnce("nope");
    anchor.props.onClick({ preventDefault: vi.fn() });
    await Promise.resolve();
    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenLastCalledWith(
      "The link could not be opened.",
    );
  });
});
