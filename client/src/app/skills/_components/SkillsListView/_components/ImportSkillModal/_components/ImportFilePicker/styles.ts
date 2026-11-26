import type { CSSProperties } from "react";

export const s = {
  fileRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  fileName: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  hiddenInput: { display: "none" } satisfies CSSProperties,
} as const;
