import type { IntentClass } from "@devdigest/shared";
import { INTENT_CLASSES } from "./constants";

/** Select options for the class picker; `label` resolves a class to its text. */
export function classOptions(label: (c: IntentClass) => string): { value: IntentClass; label: string }[] {
  return INTENT_CLASSES.map((c) => ({ value: c, label: label(c) }));
}
