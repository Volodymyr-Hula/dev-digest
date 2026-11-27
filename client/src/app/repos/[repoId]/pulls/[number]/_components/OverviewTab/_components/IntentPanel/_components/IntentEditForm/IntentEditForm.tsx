/* IntentEditForm — inline editor for a PR's intent (class, summary, scope
   lists). Save sends the whole PrIntentUpdate; the parent decides what happens
   next (it resolves false when the request failed, so the form stays open). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, SelectInput, Textarea } from "@devdigest/ui";
import type { IntentClass, PrIntent, PrIntentUpdate } from "@devdigest/shared";
import { SUMMARY_MAX } from "./constants";
import { isDraftValid, isScopeValid, toDraft, toUpdate, type IntentDraft } from "./helpers";
import { s } from "./styles";

export function IntentEditForm({
  intent,
  classOptions,
  pending,
  onSave,
  onCancel,
}: {
  intent: PrIntent;
  classOptions: { value: IntentClass; label: string }[];
  pending?: boolean;
  /** Resolves false when the save failed (the form then stays open). */
  onSave: (update: PrIntentUpdate) => Promise<boolean>;
  onCancel: () => void;
}) {
  const t = useTranslations("prIntent");
  const [draft, setDraft] = React.useState<IntentDraft>(() => toDraft(intent));
  const patch = (p: Partial<IntentDraft>) => setDraft((d) => ({ ...d, ...p }));
  const inValid = isScopeValid(draft.inScope);
  const outValid = isScopeValid(draft.outOfScope);

  return (
    <form
      data-testid="intent-edit-form"
      style={s.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (isDraftValid(draft) && !pending) void onSave(toUpdate(draft));
      }}
    >
      {/* Each control sits inside a real <label> so it is found by its label text
          (e2e `find label … fill`) as well as by its accessible name. */}
      <label style={s.field}>
        <span style={s.label}>{t("fields.class")}</span>
        <SelectInput
          aria-label={t("fields.class")}
          mono={false}
          value={draft.intentClass}
          options={classOptions}
          onChange={(v) => patch({ intentClass: v as IntentClass })}
        />
      </label>
      <label style={s.field}>
        <span style={s.label}>{t("fields.summary")}</span>
        <Textarea
          aria-label={t("fields.summary")}
          rows={3}
          maxLength={SUMMARY_MAX}
          value={draft.summary}
          onChange={(v) => patch({ summary: v })}
          invalid={!draft.summary.trim()}
        />
      </label>
      <div style={s.field}>
        <label style={s.field}>
          <span style={s.label}>{t("fields.inScope")}</span>
          <Textarea
            aria-label={t("fields.inScope")}
            rows={3}
            value={draft.inScope}
            onChange={(v) => patch({ inScope: v })}
            invalid={!inValid}
          />
        </label>
        {!inValid && <span style={s.error}>{t("fields.scopeInvalid")}</span>}
      </div>
      <div style={s.field}>
        <label style={s.field}>
          <span style={s.label}>{t("fields.outOfScope")}</span>
          <Textarea
            aria-label={t("fields.outOfScope")}
            rows={3}
            value={draft.outOfScope}
            onChange={(v) => patch({ outOfScope: v })}
            invalid={!outValid}
          />
        </label>
        {!outValid && <span style={s.error}>{t("fields.scopeInvalid")}</span>}
      </div>
      <div style={s.actions}>
        <Button type="submit" size="sm" kind="primary" icon="Check" loading={pending} disabled={!isDraftValid(draft)}>
          {t("actions.save")}
        </Button>
        <Button type="button" size="sm" kind="ghost" onClick={onCancel} disabled={pending}>
          {t("actions.cancel")}
        </Button>
      </div>
    </form>
  );
}
