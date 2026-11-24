/* SkillDraftFields — name / description / type / tags (+ body) of a new skill.
   Shared by CreateSkillModal and ImportSkillModal; validation state comes from
   the parent's `useFormValidation`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { TagInput } from "@/components/tag-input";
import { useSkillTags } from "@/lib/hooks/skills";
import { SKILL_TYPES } from "@/lib/skill-meta";
import type { useFormValidation } from "@/lib/useFormValidation";
import type { SkillDraft } from "./constants";

export function SkillDraftFields({
  draft,
  onChange,
  v,
  editBody = true,
}: {
  draft: SkillDraft;
  onChange: (patch: Partial<SkillDraft>) => void;
  v: ReturnType<typeof useFormValidation<SkillDraft>>;
  /** False when the body is shown elsewhere (import preview). */
  editBody?: boolean;
}) {
  const t = useTranslations("skills");
  const { data: allTags } = useSkillTags();

  return (
    <>
      <FormField label={t("create.name")} required hint={t("create.nameHint")} {...v.fieldProps("name")}>
        <TextInput
          value={draft.name}
          onChange={(name) => onChange({ name })}
          placeholder={t("create.namePlaceholder")}
          mono
          {...v.controlProps("name")}
        />
      </FormField>
      <FormField label={t("create.description")} {...v.fieldProps("description")}>
        <TextInput
          value={draft.description}
          onChange={(description) => onChange({ description })}
          {...v.controlProps("description")}
        />
      </FormField>
      <FormField label={t("create.type")} htmlFor={v.controlProps("type").id}>
        <SelectInput
          id={v.controlProps("type").id}
          value={draft.type}
          onChange={(type) => onChange({ type: type as SkillType })}
          options={SKILL_TYPES.map((x) => ({ value: x, label: t(`listItem.type.${x}`) }))}
        />
      </FormField>
      <FormField label={t("create.tags")} hint={t("config.tagsHint")} htmlFor={v.controlProps("tags").id}>
        <TagInput
          id={v.controlProps("tags").id}
          value={draft.tags}
          onChange={(tags) => onChange({ tags })}
          suggestions={allTags ?? []}
        />
      </FormField>
      {editBody && (
        <FormField label={t("create.body")} required {...v.fieldProps("body")}>
          <Textarea
            value={draft.body}
            onChange={(body) => onChange({ body })}
            rows={8}
            mono
            placeholder={t("create.bodyPlaceholder")}
            {...v.controlProps("body")}
          />
        </FormField>
      )}
    </>
  );
}
