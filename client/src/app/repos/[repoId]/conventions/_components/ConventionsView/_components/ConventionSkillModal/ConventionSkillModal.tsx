/* ConventionSkillModal — builds a skill (type `convention`, source `extracted`)
   from the accepted conventions. Name, description, tags and body are editable.
   Save = POST /skills, then mark the conventions as used (attach). The two calls
   are not atomic: when attach fails the skill exists, so Retry only re-attaches. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal } from "@devdigest/ui";
import type { ConventionCandidate, Skill } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useAttachConventions } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { useFormValidation } from "@/lib/useFormValidation";
import { SKILL_DRAFT_RULES, SkillDraftFields, type SkillDraft } from "@/components/skill-draft-fields";
import { buildSkillBody, evidenceFiles, suggestSkillName } from "./helpers";
import { s } from "./styles";

const MODAL_WIDTH = 760;

export function ConventionSkillModal({
  repoId,
  repoName,
  conventions,
  onClose,
}: {
  repoId: string;
  repoName: string;
  conventions: ConventionCandidate[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const tv = useTranslations("validation");
  const toast = useToast();
  const create = useCreateSkill();
  const attach = useAttachConventions(repoId);

  const [draft, setDraft] = React.useState<SkillDraft>(() => ({
    name: suggestSkillName(repoName),
    description: t("modal.defaultDescription", { repo: repoName }),
    type: "convention",
    tags: [],
    body: buildSkillBody(t("modal.bodyHeading", { repo: repoName }), t("modal.evidence"), conventions),
  }));
  // Set once the skill exists; a failed attach is retried against it.
  const [created, setCreated] = React.useState<Skill | null>(null);
  const [attachFailed, setAttachFailed] = React.useState(false);
  const v = useFormValidation(draft, SKILL_DRAFT_RULES, "convention-skill");

  const linkAndClose = async (skill: Skill) => {
    setAttachFailed(false);
    try {
      await attach.mutateAsync({ skill_id: skill.id, ids: conventions.map((c) => c.id) });
      toast.success(t("modal.createdToast", { name: skill.name }));
      onClose();
    } catch {
      setAttachFailed(true); // shown inline with a Retry; the skill is already saved
    }
  };

  const save = async () => {
    if (created) return linkAndClose(created);
    if (!v.validateAll()) return;
    try {
      const skill = await create.mutateAsync({
        ...draft,
        type: "convention",
        source: "extracted",
        evidence_files: evidenceFiles(conventions),
      });
      setCreated(skill);
      await linkAndClose(skill);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) v.setServerError("name", tv("nameTaken"));
    }
  };

  const busy = create.isPending || attach.isPending;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("modal.title")}
      subtitle={t("modal.subtitle", { count: conventions.length })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.spacer} />
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={save} disabled={busy}>
            {busy ? t("modal.saving") : created ? t("modal.retryAttach") : t("modal.save")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {attachFailed && (
          <div role="alert" style={s.attachError}>
            <Icon.AlertTriangle size={14} />
            {t("modal.attachFailed")}
          </div>
        )}
        <SkillDraftFields
          draft={draft}
          onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
          v={v}
          lockType
          bodyRows={16}
        />
      </div>
    </Modal>
  );
}
