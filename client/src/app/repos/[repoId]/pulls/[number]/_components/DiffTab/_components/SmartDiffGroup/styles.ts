import type { CSSProperties } from "react";

/** Co-located styles for SmartDiffGroup. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  // Sticky within the group: the header stays at the top while its files scroll.
  header: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "9px 12px",
    textAlign: "left",
    cursor: "pointer",
    color: "var(--text-primary)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 7,
  } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
    flexShrink: 0,
  }),
  square: (color: string): CSSProperties => ({
    width: 10,
    height: 10,
    borderRadius: 2,
    background: color,
    flexShrink: 0,
  }),
  label: { fontSize: 13.5, fontWeight: 600 } satisfies CSSProperties,
  description: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  findingCount: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--crit)",
    flexShrink: 0,
  } satisfies CSSProperties,
  filesCount: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
} as const;
