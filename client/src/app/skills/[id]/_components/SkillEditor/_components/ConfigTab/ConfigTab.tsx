/* Skill ConfigTab — name, description, type, tags, trusted, enabled and the
   markdown body. Saving any change but `enabled` creates a new version. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, FormField, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useDeleteSkill, useSkillTags, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "@/lib/skill-meta";
import { ApiError } from "@/lib/api";
import { required, skillName } from "@/lib/validation";
import { useFormValidation } from "@/lib/useFormValidation";
import { TagInput } from "@/components/tag-input";
import { BodyEditor } from "./_components/BodyEditor";
import { sameList } from "./helpers";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const tv = useTranslations("validation");
  const toast = useToast();
  const router = useRouter();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const { data: tagSuggestions } = useSkillTags();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [tags, setTags] = React.useState<string[]>(skill.tags);
  const [trusted, setTrusted] = React.useState(skill.trusted);
  const [enabled, setEnabled] = React.useState(skill.enabled);
  const [body, setBody] = React.useState(skill.body);

  const v = useFormValidation({ name, body }, { name: [required, skillName], body: [required] }, "skill-config");

  // Reset local form when switching skills or the active version changes.
  React.useEffect(() => {
    v.reset();
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setTags(skill.tags);
    setTrusted(skill.trusted);
    setEnabled(skill.enabled);
    setBody(skill.body);
  }, [skill.id, skill.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const bodyDirty = body !== skill.body;

  const save = () => {
    if (!v.validateAll()) return;
    update.mutate(
      { id: skill.id, patch: { name, description, type, tags, trusted, enabled, body } },
      {
        onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })),
        onError: (e) => {
          if (e instanceof ApiError && e.status === 409) v.setServerError("name", tv("nameTaken"));
        },
      },
    );
  };

  const remove = () => {
    const msg =
      skill.agent_count > 0
        ? t("config.deleteConfirmLinked", { name: skill.name, count: skill.agent_count })
        : t("config.deleteConfirm", { name: skill.name });
    if (!window.confirm(msg)) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("config.deletedToast"));
        router.push("/skills");
      },
    });
  };

  const unchanged =
    name === skill.name &&
    description === skill.description &&
    type === skill.type &&
    sameList(tags, skill.tags) &&
    trusted === skill.trusted &&
    enabled === skill.enabled &&
    !bodyDirty;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required {...v.fieldProps("name")}>
        <TextInput value={name} onChange={setName} mono {...v.controlProps("name")} />
      </FormField>
      <FormField label={t("config.description")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput
          value={type}
          onChange={(v) => setType(v as SkillType)}
          options={SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }))}
        />
      </FormField>
      <FormField label={t("config.tags")} hint={t("config.tagsHint")} htmlFor="skill-config-tags">
        <TagInput id="skill-config-tags" value={tags} onChange={setTags} suggestions={tagSuggestions ?? []} />
      </FormField>
      <FormField hint={t("config.trustedHint")}>
        <Checkbox checked={trusted} onChange={setTrusted} label={t("config.trusted")} />
      </FormField>
      <FormField label={t("config.body")} required {...v.fieldProps("body")}>
        <BodyEditor
          fileName={`${name || skill.name}.md`}
          value={body}
          onChange={setBody}
          dirty={bodyDirty}
          {...v.controlProps("body")}
        />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending || unchanged}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>}
        <span style={s.spacer} />
        <Button kind="ghost" icon="Trash" onClick={remove} disabled={del.isPending}>
          {t("config.delete")}
        </Button>
      </div>
    </div>
  );
}
