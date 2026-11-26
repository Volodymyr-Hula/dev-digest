/* useFormValidation — inline validation shared by every form.
   An error shows once its field has been blurred (or after a submit attempt);
   from then on it tracks every change, so it clears while the user fixes it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { fieldErrorId } from "@devdigest/ui";
import { validateValues, type FieldError, type Rules } from "./validation";

export function useFormValidation<V extends object>(values: V, rules: Rules<V>, idPrefix: string) {
  const t = useTranslations("validation");
  const [touched, setTouched] = React.useState<Partial<Record<keyof V, boolean>>>({});
  const [server, setServer] = React.useState<Partial<Record<keyof V, { message: string; value: unknown }>>>({});

  const errors = validateValues(values, rules);

  const errorOf = (field: keyof V): FieldError | null => {
    const srv = server[field];
    // A server error (e.g. 409 name taken) sticks until the value changes.
    if (srv && srv.value === values[field]) return { key: "", message: srv.message };
    return touched[field] ? (errors[field] ?? null) : null;
  };

  const message = (field: keyof V): string | undefined => {
    const e = errorOf(field);
    if (!e) return undefined;
    return e.message ?? t(e.key, e.values);
  };

  const id = (field: keyof V) => `${idPrefix}-${String(field)}`;

  const blur = (field: keyof V) => setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));

  /** Touch every ruled field; focus the first invalid one. True when valid. */
  const validateAll = (): boolean => {
    const all = Object.fromEntries(Object.keys(rules).map((k) => [k, true])) as Partial<Record<keyof V, boolean>>;
    setTouched(all);
    const first = (Object.keys(rules) as (keyof V)[]).find((f) => errors[f]);
    if (first === undefined) return true;
    if (typeof document !== "undefined") document.getElementById(id(first))?.focus();
    return false;
  };

  /** Show `msg` on `field` until its value changes from `value` (default: the current one). */
  const setServerError = (field: keyof V, msg: string, value: V[keyof V] = values[field]) => {
    setServer((prev) => ({ ...prev, [field]: { message: msg, value } }));
    if (typeof document !== "undefined") document.getElementById(id(field))?.focus();
  };

  const reset = () => {
    setTouched({});
    setServer({});
  };

  /** Props for the `<FormField>` wrapper. */
  const fieldProps = (field: keyof V) => ({ htmlFor: id(field), error: message(field) });

  /** Props for the control inside (TextInput / Textarea / SelectInput). */
  const controlProps = (field: keyof V) => {
    const msg = message(field);
    return {
      id: id(field),
      invalid: !!msg,
      onBlur: () => blur(field),
      "aria-describedby": msg ? fieldErrorId(id(field)) : undefined,
    };
  };

  return {
    isValid: Object.keys(errors).length === 0,
    errorOf,
    message,
    blur,
    validateAll,
    setServerError,
    reset,
    fieldProps,
    controlProps,
  };
}
