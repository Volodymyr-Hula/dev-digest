import type { CSSProperties } from "react";

export const s = {
  pageHeader: { padding: "24px 32px 10px", display: "flex", alignItems: "flex-end", gap: 16 } satisfies CSSProperties,
  pageTitle: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  pageSubtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4, maxWidth: 680 } satisfies CSSProperties,
  stats: { fontSize: 13, color: "var(--text-muted)", marginTop: 6 } satisfies CSSProperties,
  headerActions: { marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" } satisfies CSSProperties,
  content: { padding: "10px 32px 32px", display: "flex", flexDirection: "column", gap: 24 } satisfies CSSProperties,
} as const;
