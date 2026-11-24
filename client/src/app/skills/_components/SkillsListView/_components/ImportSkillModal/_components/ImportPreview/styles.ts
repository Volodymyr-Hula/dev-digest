import type { CSSProperties } from "react";

export const s = {
  note: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    fontSize: 13,
    lineHeight: 1.5,
    padding: "10px 12px",
    borderRadius: 8,
    marginBottom: 18,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  warnings: {
    fontSize: 13,
    padding: "10px 12px 10px 28px",
    margin: "0 0 18px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    color: "var(--text-secondary)",
    listStyle: "disc",
  } satisfies CSSProperties,
  sectionLabel: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  ignored: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 18 } satisfies CSSProperties,
  ignoredList: { margin: "6px 0 0", paddingLeft: 18, listStyle: "disc" } satisfies CSSProperties,
  bodyPreview: {
    maxHeight: 280,
    overflowY: "auto",
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 14,
  } satisfies CSSProperties,
} as const;
