import type { CSSProperties } from "react";

/** Co-located styles for the DiffTab. */
export const s = {
  headerRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 14,
  } satisfies CSSProperties,
  title: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  titleText: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  summary: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  controls: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  segmented: {
    display: "inline-flex",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    overflow: "hidden",
  } satisfies CSSProperties,
  segment: (active: boolean): CSSProperties => ({
    padding: "5px 11px",
    fontSize: 12.5,
    fontWeight: 500,
    border: "none",
    cursor: "pointer",
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
  }),
  notReviewed: {
    marginBottom: 12,
    padding: "8px 12px",
    fontSize: 13,
    color: "var(--text-muted)",
    background: "var(--bg-elevated)",
    border: "1px dashed var(--border)",
    borderRadius: 7,
  } satisfies CSSProperties,
  groups: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
} as const;
