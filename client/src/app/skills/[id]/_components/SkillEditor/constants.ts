import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface EditorTab {
  key: "config" | "preview" | "versions";
  labelKey: string;
  icon: IconName;
}

export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "tabs.preview", icon: "Eye" },
  { key: "versions", labelKey: "tabs.versions", icon: "History" },
];

export const VALID_TABS = TABS.map((tb) => tb.key);
