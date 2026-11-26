import type { CSSProperties } from "react";

export const s = {
  error: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    fontSize: 13,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--danger, var(--warn))",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  errorIcon: { flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  errorDetail: {
    display: "block",
    marginTop: 4,
    fontSize: 12,
    color: "var(--text-muted)",
    wordBreak: "break-word",
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
