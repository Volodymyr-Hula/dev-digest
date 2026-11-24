import type { CSSProperties } from "react";

export const s = {
  footer: { display: "flex", gap: 10, alignItems: "center" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  body: { padding: 24 } satisfies CSSProperties,
} as const;
