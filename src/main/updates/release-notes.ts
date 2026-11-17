import type {
  ReleaseNotesDocument,
  ReleaseNotesSection,
} from "../../shared/ipc-types";
import type { Block, Inline, ListItem } from "../../shared/release-notes-markdown.mjs";
import { LIMITS, parseReleaseNotes } from "../../shared/release-notes-markdown.mjs";

const MAX_HTML_LENGTH = 100_000;
const FORBIDDEN_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function codePointToString(code: number, fallback: string): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
    return fallback;
  }
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

// Single pass, so "&amp;lt;" decodes to "&lt;" and never to "<".
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return codePointToString(parseInt(body.slice(2), 16), match);
    }
    if (body.startsWith("#")) {
      return codePointToString(parseInt(body.slice(1), 10), match);
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

function cleanText(text: string): string {
  const value = decodeEntities(text);
  if (FORBIDDEN_CHARS.test(value)) throw new Error("Forbidden character.");
  return value.replace(/\s+/g, " ");
}

export function parseReleaseNotesHtml(html: string): ReleaseNotesDocument | null {
  if (typeof html !== "string" || !html || html.length > MAX_HTML_LENGTH) return null;
  type Node = { name: string; text?: string; attrs?: string; children: Node[] };
  try {
    const root: Node = { name: "root", children: [] };
    const stack: Node[] = [root];
    const tokens = /<!--[\s\S]*?-->|<\/?[A-Za-z][^<>]*>|[^<]+|</gy;
    let match: RegExpExecArray | null;
    let cursor = 0;
    while (cursor < html.length && (match = tokens.exec(html))) {
      if (match.index !== cursor) return null;
      const token = match[0];
      cursor += token.length;
      if (token.startsWith("<!--") || token === "<") return null;
      if (!token.startsWith("<")) {
        stack[stack.length - 1].children.push({ name: "#text", text: token, children: [] });
        continue;
      }
      const tag = /^<(\/)?([A-Za-z][A-Za-z0-9-]*)([\s\S]*?)>$/.exec(token);
      if (!tag || /\/\s*$/.test(tag[3])) return null;
      const name = tag[2].toLowerCase();
      if (tag[1]) {
        if (tag[3].trim() || stack.length === 1 || stack[stack.length - 1].name !== name) return null;
        stack.pop();
      } else {
        const node: Node = { name, attrs: tag[3], children: [] };
        stack[stack.length - 1].children.push(node);
        stack.push(node);
      }
      if (stack.length > 8) return null;
    }
    if (cursor !== html.length || stack.length !== 1) return null;
    let bullets = 0;
    let length = 0;
    const inlines = (nodes: Node[], context: { bold: boolean; italic: boolean; link: boolean } = { bold: false, italic: false, link: false }): Inline[] => {
      const output: Inline[] = [];
      for (const node of nodes) {
        if (node.name === "#text") {
          const value = cleanText(node.text ?? "");
          length += value.trim().length;
          if (length > LIMITS.maxEntryLength) throw new Error("Text limit.");
          if (!value.trim()) {
            if (output.length) {
              if (output.at(-1)?.type === "text") (output.at(-1) as { value: string }).value += " ";
              else output.push({ type: "text", value: " " });
            }
            continue;
          }
          const next = value.trim();
          const leading = value.startsWith(" ") && output.length > 0 ? " " : "";
          const trailing = value.endsWith(" ") ? " " : "";
          if (output.at(-1)?.type === "text") (output.at(-1) as { value: string }).value += leading + next + trailing;
          else output.push({ type: "text", value: leading + next + trailing });
        } else if (node.name === "strong" || node.name === "em") {
          const bold = node.name === "strong";
          if ((bold && context.bold) || (!bold && context.italic)) throw new Error("Nested formatting.");
          const children = inlines(node.children, { ...context, [bold ? "bold" : "italic"]: true });
          if (!children.length) throw new Error("Empty formatting.");
          output.push({ type: bold ? "bold" : "italic", children });
        } else if (node.name === "code") {
          if (node.children.some((child) => child.name !== "#text")) throw new Error("Code content must be plain text.");
          const value = cleanText(node.children.map((child) => child.text ?? "").join("")).trim();
          length += value.length;
          if (length > LIMITS.maxEntryLength) throw new Error("Text limit.");
          output.push({ type: "code", value });
        } else if (node.name === "a") {
          const hrefMatch = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(node.attrs ?? "");
          const rawHref = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3];
          if (!rawHref) throw new Error("Invalid URL.");
          const href = decodeEntities(rawHref);
          if (href.length > LIMITS.maxUrlLength || /[\s"'<>]/.test(href) || context.link) throw new Error("Invalid URL.");
          if (FORBIDDEN_CHARS.test(href)) throw new Error("Invalid URL.");
          const url = new URL(href);
          if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error("Invalid URL.");
          const children = inlines(node.children, { ...context, link: true });
          if (!children.length) throw new Error("Empty link.");
          output.push({ type: "link", href, children });
        } else if (node.name === "h3") {
          throw new Error("Heading is not plain text.");
        } else throw new Error("Unsupported inline element.");
      }
      return output;
    };
    const list = (node: Node, depth: number): Extract<Block, { type: "list" }> => {
      if (depth > 1) throw new Error("Nested list depth.");
      const items: ListItem[] = [];
      for (const child of node.children) {
        if (child.name === "#text" && !(child.text ?? "").trim()) continue;
        if (child.name !== "li") throw new Error("List must contain list items.");
        if (++bullets > LIMITS.maxBullets) throw new Error("Bullet limit.");
        const item: ListItem = { inline: [], children: [] };
        let usedParagraph = false;
        let usedNestedList = false;
        let inlineGroup: Node[] = [];
        const flushInlineGroup = (): void => {
          if (inlineGroup.length) {
            item.inline.push(...inlines(inlineGroup));
            inlineGroup = [];
          }
        };
        for (const part of child.children) {
          if (part.name === "#text" || ["strong", "em", "code", "a"].includes(part.name)) {
            inlineGroup.push(part);
          } else if (part.name === "p" && !usedParagraph && item.inline.length === 0) {
            flushInlineGroup();
            usedParagraph = true;
            item.inline.push(...inlines(part.children));
          } else if (part.name === "ul" && !usedNestedList) {
            flushInlineGroup();
            usedNestedList = true;
            const nested = list(part, depth + 1);
            item.children.push(...nested.items.map((nestedItem) => ({ inline: nestedItem.inline })));
          } else throw new Error("Unsupported list content.");
        }
        flushInlineGroup();
        if (!item.inline.length) throw new Error("Empty list item.");
        items.push(item);
      }
      return { type: "list", items };
    };
    const sections: ReleaseNotesSection[] = [];
    let section: ReleaseNotesSection | null = null;
    for (const child of root.children) {
      if (child.name === "#text" && !(child.text ?? "").trim()) continue;
      if (child.name === "h3") {
        const headingText = child.children.map((node) => {
          if (node.name !== "#text") throw new Error("Heading must be plain text.");
          return cleanText(node.text ?? "");
        }).join("").trim();
        if (!headingText) throw new Error("Empty heading.");
        length += headingText.length;
        if (length > LIMITS.maxEntryLength) throw new Error("Text limit.");
        section = { heading: headingText, blocks: [] };
        sections.push(section);
      } else if (child.name === "ul" || child.name === "p") {
        section ??= { heading: null, blocks: [] };
        if (!sections.includes(section)) sections.push(section);
        section.blocks.push(child.name === "ul" ? list(child, 0) : { type: "paragraph", inline: inlines(child.children) });
      } else throw new Error("Unsupported block.");
    }
    return sections.length && sections.every((entry) => entry.blocks.length > 0) ? { sections } : null;
  } catch {
    return null;
  }
}

export function parseUpdaterReleaseNotes(input: unknown): ReleaseNotesDocument | null {
  let totalLength = 0;
  let totalBullets = 0;
  const append = (newSections: ReleaseNotesSection[]): boolean => {
    for (const section of newSections) {
      totalLength += section.heading?.length ?? 0;
      for (const block of section.blocks) {
        const countInline = (nodes: Inline[]): void => {
          for (const node of nodes) {
            if (node.type === "text" || node.type === "code") totalLength += node.value.length;
            else if (node.type === "bold" || node.type === "italic" || node.type === "link") countInline(node.children);
          }
        };
        if (block.type === "paragraph") countInline(block.inline);
        else {
          const countList = (items: Array<{ inline: Inline[]; children?: Array<{ inline: Inline[] }> }>): void => items.forEach((item) => {
            totalBullets++;
            countInline(item.inline);
            if (item.children) countList(item.children);
          });
          countList(block.items);
        }
      }
    }
    return totalLength <= LIMITS.maxEntryLength && totalBullets <= LIMITS.maxBullets;
  };
  const parseText = (text: string): ReleaseNotesSection[] => {
    if (!text.trim()) {
      return [];
    }
    if (!/<(h3|ul|li)\b/i.test(text) && text.includes("### ")) {
      const result = parseReleaseNotes(text);
      return result.valid ? result.notes.sections : [];
    }
    return parseReleaseNotesHtml(text)?.sections ?? [];
  };

  let sections: ReleaseNotesSection[] = [];
  if (typeof input === "string") {
    sections = parseText(input);
    if (!append(sections)) return null;
  } else if (Array.isArray(input)) {
    for (const entry of input) {
      if (!entry || typeof entry !== "object") return null;
      const note = (entry as { note?: unknown }).note;
      if (typeof note !== "string") return null;
      if (note.trim()) {
        const parsed = parseText(note);
        if (!parsed.length || !append(parsed)) return null;
        sections.push(...parsed);
      }
    }
  }
  return sections.length > 0 ? { sections } : null;
}

export function compareVersions(a: string, b: string): number | null {
  const parse = (value: string): number[] | null => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim().split("-")[0]);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  };
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) {
    return null;
  }
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) {
      return left[i] > right[i] ? 1 : -1;
    }
  }
  return 0;
}

export function decideWhatsNew(
  lastSeen: string | null,
  current: string,
): "seed" | "show" | "none" {
  if (compareVersions(current, current) === null) {
    return "none";
  }
  if (!lastSeen) {
    return "seed";
  }
  const result = compareVersions(current, lastSeen);
  if (result === null) {
    return "seed";
  }
  return result > 0 ? "show" : "none";
}
