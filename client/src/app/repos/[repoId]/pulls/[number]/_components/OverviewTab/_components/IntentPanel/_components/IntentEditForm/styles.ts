import type { CSSProperties } from "react";

export const s = {
  form: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)" } satisfies CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, alignItems: "center" } satisfies CSSProperties,
} as const;
