import type { CSSProperties } from "react";

export const s = {
  footer: { display: "flex", gap: 10, alignItems: "center" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  body: { padding: 24 } satisfies CSSProperties,
  attachError: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    fontSize: 13,
    padding: "10px 12px",
    marginBottom: 18,
    borderRadius: 8,
    border: "1px solid var(--warn)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
