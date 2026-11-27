import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  item: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 } satisfies CSSProperties,
  kind: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  ref: { color: "var(--text-secondary)", fontSize: 12, wordBreak: "break-all" } satisfies CSSProperties,
  tag: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", paddingLeft: 22 } satisfies CSSProperties,
} as const;
