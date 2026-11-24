import type { CSSProperties } from "react";

export const s = {
  card: (muted: boolean): CSSProperties => ({
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    opacity: muted ? 0.7 : 1,
  }),
  header: { display: "flex", alignItems: "flex-start", gap: 12 } satisfies CSSProperties,
  rule: { flex: 1, fontSize: 14, fontWeight: 550, lineHeight: 1.45, whiteSpace: "pre-wrap" } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 } satisfies CSSProperties,
  path: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12,
    lineHeight: 1.5,
    overflowX: "auto",
    maxHeight: 240,
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, alignItems: "center" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;
