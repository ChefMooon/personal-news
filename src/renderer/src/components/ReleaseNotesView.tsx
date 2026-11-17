import React from "react";
import type { Block, Inline, ListItem } from "../../../shared/release-notes-markdown.mjs";
import type { ReleaseNotesDocument } from "../../../shared/ipc-types";
import { getSafeExternalHref, openReleaseNotesLink } from "../lib/release-notes";

interface ReleaseNotesViewProps {
  notes: ReleaseNotesDocument;
}

export function ReleaseNotesView({
  notes,
}: ReleaseNotesViewProps): React.ReactElement {
  const renderInline = (value: unknown, keyPrefix: string): React.ReactNode => {
    if (!Array.isArray(value)) return null;
    return value.map((part: Inline, index) => {
      if (!part || typeof part !== "object") return null;
      const key = `${keyPrefix}-${index}`;
      switch (part.type) {
        case "text":
          return typeof part.value === "string" ? part.value : null;
        case "code":
          return typeof part.value === "string" ? (
            <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono">
              {part.value}
            </code>
          ) : null;
        case "bold":
          return (
            <strong key={key}>
              {renderInline(part.children, key)}
            </strong>
          );
        case "italic":
          return <em key={key}>{renderInline(part.children, key)}</em>;
        case "link": {
          const href = getSafeExternalHref(part.href);
          const children = renderInline(part.children, key);
          return href ? (
            <a
              key={key}
              href={href}
              rel="noopener noreferrer"
              title={href}
              className="underline underline-offset-2 decoration-muted-foreground/50 transition-colors hover:text-primary rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(event) => {
                event.preventDefault();
                openReleaseNotesLink(href);
              }}
            >
              {children}
            </a>
          ) : (
            <span key={key}>{children}</span>
          );
        }
        default:
          return null;
      }
    });
  };

  const renderItem = (item: unknown, key: number): React.ReactNode => {
    if (!item || typeof item !== "object") return null;
    const listItem = item as ListItem;
    const children = Array.isArray(listItem.children) ? listItem.children : [];
    return (
      <li key={key}>
        {renderInline(listItem.inline, `item-${key}`)}
        {children.length ? (
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {children.map((child, childIndex) => renderItem(child, childIndex))}
          </ul>
        ) : null}
      </li>
    );
  };

  const renderBlock = (block: unknown, key: number): React.ReactNode => {
    if (!block || typeof block !== "object") return null;
    const current = block as Block;
    if (current.type === "paragraph") {
      return <p key={key}>{renderInline(current.inline, `paragraph-${key}`)}</p>;
    }
    if (current.type === "list") {
      const items = Array.isArray(current.items) ? current.items : [];
      return (
        <ul key={key} className="list-disc space-y-1 pl-5">
          {items.map((item, index) => renderItem(item, index))}
        </ul>
      );
    }
    return null;
  };

  const sections = Array.isArray(notes.sections) ? notes.sections : [];
  const hasRenderableSections = sections.some(
    (section) =>
      !!section &&
      typeof section === "object" &&
      Array.isArray(section.blocks) &&
      section.blocks.length > 0,
  );

  if (
    !hasRenderableSections &&
    typeof notes.fallbackText === "string"
  ) {
    return (
      <p className="whitespace-pre-wrap break-words">{notes.fallbackText}</p>
    );
  }

  return (
    <div className="space-y-4 break-words">
      {sections.map((section, index) => {
        if (!section || typeof section !== "object") return null;
        const blocks = Array.isArray(section.blocks) ? section.blocks : [];
        return (
          <div key={index} className="space-y-1">
            {typeof section.heading === "string" && section.heading ? (
              <h4 className="mb-1 font-medium">{section.heading}</h4>
            ) : null}
            {blocks.map((block, blockIndex) => renderBlock(block, blockIndex))}
          </div>
        );
      })}
    </div>
  );
}
