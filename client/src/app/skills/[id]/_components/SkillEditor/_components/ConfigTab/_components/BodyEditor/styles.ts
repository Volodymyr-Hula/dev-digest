import type { CSSProperties } from "react";

export const LINE_HEIGHT = 20;
const PAD = 10;
/** Room for the textarea's own horizontal scrollbar (long lines don't wrap). */
const SCROLLBAR = 16;

/** Explicit textarea height for `lines` lines — it must not be stretched to the
 *  scroll box (max 520px), or lines past the box are clipped instead of scrolled. */
export function textareaHeight(lines: number): number {
  return lines * LINE_HEIGHT + PAD * 2 + SCROLLBAR;
}

export const s = {
  frame: (invalid: boolean): CSSProperties => ({
    border: "1px solid " + (invalid ? "var(--crit)" : "var(--border)"),
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-surface)",
  }),
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  unsaved: {
    fontSize: 11,
    padding: "0 6px",
    borderRadius: 4,
    background: "var(--bg-hover)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  tokens: { marginLeft: "auto", color: "var(--text-muted)" } satisfies CSSProperties,
  scroll: { display: "flex", alignItems: "flex-start", maxHeight: 520, overflowY: "auto" } satisfies CSSProperties,
  gutter: {
    flexShrink: 0,
    padding: `${PAD}px 10px ${PAD + SCROLLBAR}px 12px`,
    textAlign: "right",
    color: "var(--text-muted)",
    fontSize: 12,
    lineHeight: `${LINE_HEIGHT}px`,
    userSelect: "none",
    borderRight: "1px solid var(--border)",
    margin: 0,
  } satisfies CSSProperties,
  textarea: {
    flex: 1,
    minWidth: 0,
    resize: "none",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: `${LINE_HEIGHT}px`,
    padding: PAD,
    whiteSpace: "pre",
    overflowX: "auto",
    overflowY: "hidden",
  } satisfies CSSProperties,
} as const;
