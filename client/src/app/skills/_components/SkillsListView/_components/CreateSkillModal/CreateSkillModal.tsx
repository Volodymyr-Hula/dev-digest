"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useCreateSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { useFormValidation } from "@/lib/useFormValidation";
import { EMPTY_DRAFT, SKILL_DRAFT_RULES, SkillDraftFields, type SkillDraft } from "@/components/skill-draft-fields";
import { MODAL_WIDTH } from "./constants";
import { s } from "./styles";

/** Create-skill modal — name / description / type / tags / body. Trust is edited in Config. */
export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const tv = useTranslations("validation");
  const router = useRouter();
  const create = useCreateSkill();
  const [draft, setDraft] = React.useState<SkillDraft>(EMPTY_DRAFT);
  const v = useFormValidation(draft, SKILL_DRAFT_RULES, "create-skill");

  const submit = async () => {
    if (!v.validateAll()) return;
    try {
      const skill = await create.mutateAsync(draft);
      onClose();
      router.push(`/skills/${skill.id}?tab=config`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) v.setServerError("name", tv("nameTaken"));
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <SkillDraftFields draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} v={v} />
      </div>
    </Modal>
  );
}
