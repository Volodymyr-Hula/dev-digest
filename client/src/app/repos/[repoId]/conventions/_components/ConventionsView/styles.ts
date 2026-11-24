import type { CSSProperties } from "react";

export const s = {
  pageHeader: { padding: "24px 32px 10px", display: "flex", alignItems: "flex-end", gap: 16 } satisfies CSSProperties,
  pageTitle: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  pageSubtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4, maxWidth: 680 } satisfies CSSProperties,
  stats: { fontSize: 13, color: "var(--text-muted)", marginTop: 6 } satisfies CSSProperties,
  headerActions: { marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" } satisfies CSSProperties,
  content: { padding: "10px 32px 32px", display: "flex", flexDirection: "column", gap: 24 } satisfies CSSProperties,
  error: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    fontSize: 13,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--danger, var(--warn))",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  section: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  sectionLabel: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  loadingStack: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
} as const;
