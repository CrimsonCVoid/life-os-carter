"use client";

import * as React from "react";

/** Tiny safe markdown renderer: **bold**, *italic*, lines starting with - become bullets. */
export function Markdown({ text }: { text: string }) {
  const blocks = React.useMemo(() => parseBlocks(text), [text]);
  return (
    <div className="text-[15px] leading-relaxed text-[var(--color-fg)] space-y-2">
      {blocks.map((b, i) => {
        if (b.type === "ul") {
          return (
            <ul key={i} className="list-disc pl-5 space-y-0.5">
              {b.items.map((line, j) => (
                <li key={j}>{renderInline(line)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {renderInline(b.text)}
          </p>
        );
      })}
    </div>
  );
}

type Block = { type: "p"; text: string } | { type: "ul"; items: string[] };

function parseBlocks(text: string): Block[] {
  const lines = text.split(/\r?\n/);
  const out: Block[] = [];
  let cur: Block | null = null;
  for (const raw of lines) {
    const line = raw;
    if (/^\s*[-*]\s+/.test(line)) {
      const content = line.replace(/^\s*[-*]\s+/, "");
      if (cur && cur.type === "ul") cur.items.push(content);
      else {
        cur = { type: "ul", items: [content] };
        out.push(cur);
      }
    } else if (line.trim() === "") {
      cur = null;
    } else {
      if (cur && cur.type === "p") cur.text += "\n" + line;
      else {
        cur = { type: "p", text: line };
        out.push(cur);
      }
    }
  }
  return out;
}

function renderInline(text: string): React.ReactNode[] {
  // **bold** then *italic*
  const out: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length) {
    const bold = rest.match(/\*\*(.+?)\*\*/);
    const ital = rest.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
    let match: { index: number; full: string; inner: string; kind: "b" | "i" } | null = null;
    if (bold && bold.index != null) {
      match = { index: bold.index, full: bold[0], inner: bold[1], kind: "b" };
    }
    if (ital && ital.index != null && (match == null || ital.index < match.index)) {
      match = { index: ital.index, full: ital[0], inner: ital[1], kind: "i" };
    }
    if (!match) {
      out.push(<React.Fragment key={key++}>{rest}</React.Fragment>);
      break;
    }
    if (match.index > 0) {
      out.push(<React.Fragment key={key++}>{rest.slice(0, match.index)}</React.Fragment>);
    }
    if (match.kind === "b") {
      out.push(
        <strong key={key++} className="font-semibold">
          {match.inner}
        </strong>
      );
    } else {
      out.push(
        <em key={key++} className="italic text-[var(--color-fg-2)]">
          {match.inner}
        </em>
      );
    }
    rest = rest.slice(match.index + match.full.length);
  }
  return out;
}
