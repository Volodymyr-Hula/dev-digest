import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 960 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0 16px" } satisfies CSSProperties,
  layout: { display: "flex", gap: 16, alignItems: "flex-start" } satisfies CSSProperties,
  list: { width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  item: (active: boolean): CSSProperties => ({
    textAlign: "left",
    padding: "8px 12px",
    borderRadius: 6,
    cursor: "pointer",
    border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    color: "var(--text-primary)",
  }),
  itemTop: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  itemDate: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  detail: {
    flex: 1,
    minWidth: 0,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "16px 20px",
    fontSize: 14,
  } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 } satisfies CSSProperties,
  description: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  body: {
    fontSize: 14,
    borderTop: "1px solid var(--border)",
    paddingTop: 12,
  } satisfies CSSProperties,
} as const;
