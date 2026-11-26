/* validation.ts — pure field rules for inline form validation.
   A rule returns null (valid) or a `FieldError` whose `key` is a message in the
   `validation` i18n namespace. Server-side zod stays the source of truth; these
   mirror it so the user sees the problem before submitting. */
import { isValidSkillName, SKILL_NAME_MAX } from "./skill-meta";

export interface FieldError {
  key: string;
  values?: Record<string, string | number>;
  /** Already-translated text (e.g. a server message) — wins over `key`. */
  message?: string;
}

export type Rule<T = string> = (value: T) => FieldError | null;
export type Rules<V> = { [K in keyof V]?: readonly Rule<V[K]>[] };

const asText = (v: unknown) => (typeof v === "string" ? v : "");

export const required: Rule<unknown> = (v) => (asText(v).trim() === "" ? { key: "required" } : null);

export const maxLen =
  (max: number): Rule<unknown> =>
  (v) =>
    asText(v).length > max ? { key: "tooLong", values: { max } } : null;

/** Kebab-case skill name; empty is left to `required`. */
export const skillName: Rule<unknown> = (v) => {
  const s = asText(v);
  if (s === "") return null;
  if (s.length > SKILL_NAME_MAX) return { key: "tooLong", values: { max: SKILL_NAME_MAX } };
  return isValidSkillName(s) ? null : { key: "skillNameFormat" };
};

/** Absolute https:// URL; empty is left to `required`. */
export const httpsUrl: Rule<unknown> = (v) => {
  const s = asText(v).trim();
  if (s === "") return null;
  try {
    return new URL(s).protocol === "https:" ? null : { key: "httpsUrl" };
  } catch {
    return { key: "invalidUrl" };
  }
};

const GITHUB_HTTPS_RE = /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+?(\.git)?\/?$/;
const GITHUB_SSH_RE = /^git@github\.com:[A-Za-z0-9-]+\/[A-Za-z0-9._-]+?(\.git)?$/;

/** GitHub repo URL (https or ssh) — a loose mirror of the server's `parseRepoUrl`. */
export const githubRepoUrl: Rule<unknown> = (v) => {
  const s = asText(v).trim();
  if (s === "") return null;
  return GITHUB_HTTPS_RE.test(s) || GITHUB_SSH_RE.test(s) ? null : { key: "githubRepoUrl" };
};

/** Runs each field's rules in order; the first failure wins. */
export function validateValues<V extends object>(values: V, rules: Rules<V>): Partial<Record<keyof V, FieldError>> {
  const out: Partial<Record<keyof V, FieldError>> = {};
  for (const field of Object.keys(rules) as (keyof V)[]) {
    for (const rule of rules[field] ?? []) {
      const err = rule(values[field]);
      if (err) {
        out[field] = err;
        break;
      }
    }
  }
  return out;
}
