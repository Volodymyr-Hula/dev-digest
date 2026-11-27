import type { IntentClass, PrIntent, PrIntentUpdate } from "@devdigest/shared";
import { SCOPE_ITEM_MAX, SCOPE_MAX_ITEMS, SUMMARY_MAX } from "./constants";

export interface IntentDraft {
  intentClass: IntentClass;
  summary: string;
  inScope: string;
  outOfScope: string;
}

/** One scope item per non-empty line. */
export function parseScope(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function toDraft(
  i: Pick<PrIntent, "intent_class" | "intent" | "in_scope" | "out_of_scope">,
): IntentDraft {
  return {
    intentClass: i.intent_class,
    summary: i.intent,
    inScope: i.in_scope.join("\n"),
    outOfScope: i.out_of_scope.join("\n"),
  };
}

export function isScopeValid(text: string): boolean {
  const items = parseScope(text);
  return items.length <= SCOPE_MAX_ITEMS && items.every((x) => x.length <= SCOPE_ITEM_MAX);
}

export function isDraftValid(d: IntentDraft): boolean {
  const summary = d.summary.trim();
  return (
    summary.length > 0 &&
    summary.length <= SUMMARY_MAX &&
    isScopeValid(d.inScope) &&
    isScopeValid(d.outOfScope)
  );
}

export function toUpdate(d: IntentDraft): PrIntentUpdate {
  return {
    intent_class: d.intentClass,
    intent: d.summary.trim(),
    in_scope: parseScope(d.inScope),
    out_of_scope: parseScope(d.outOfScope),
  };
}
