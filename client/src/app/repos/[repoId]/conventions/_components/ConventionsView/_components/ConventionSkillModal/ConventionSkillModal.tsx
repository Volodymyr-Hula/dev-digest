/* ConventionSkillModal — builds a skill (type `convention`, source `extracted`)
   from a chosen subset of the accepted conventions; the rest stay available for
   another skill. The body follows the selection until the user edits it by hand
   (then "Rebuild body" re-applies it). Name, description, tags and body are editable.
   Save = POST /skills, then mark the conventions as used (attach). The two calls
   are not atomic: when attach fails the skill exists, so Retry only re-attaches. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon, Modal } from "@devdigest/ui";
import type { ConventionCandidate, Skill } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useAttachConventions } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { useFormValidation } from "@/lib/useFormValidation";
import { SKILL_DRAFT_RULES, SkillDraftFields, type SkillDraft } from "@/components/skill-draft-fields";
import { MODAL_WIDTH } from "./constants";
import { buildSkillBody, evidenceFiles, suggestSkillName } from "./helpers";
import { s } from "./styles";

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

  const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<string>>(() => new Set(conventions.map((c) => c.id)));
  const selected = conventions.filter((c) => selectedIds.has(c.id));
  const bodyFor = (list: readonly ConventionCandidate[]) =>
    buildSkillBody(t("modal.bodyHeading", { repo: repoName }), t("modal.evidence"), list);
  const [draft, setDraft] = React.useState<SkillDraft>(() => ({
    name: suggestSkillName(repoName),
    description: t("modal.defaultDescription", { repo: repoName }),
    type: "convention",
    tags: [],
    body: bodyFor(conventions),
  }));
  // Once edited by hand, the body no longer follows the selection.
  const [bodyEdited, setBodyEdited] = React.useState(false);
  // Set once the skill exists; a failed attach is retried against it.
  const [created, setCreated] = React.useState<Skill | null>(null);
  const [attachFailed, setAttachFailed] = React.useState(false);
  const v = useFormValidation(draft, SKILL_DRAFT_RULES, "convention-skill");

  const toggle = (id: string, on: boolean) => {
    if (created) return; // the skill exists — only its attach is retried
    const next = new Set(selectedIds);
    if (on) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
    if (!bodyEdited) setDraft((d) => ({ ...d, body: bodyFor(conventions.filter((c) => next.has(c.id))) }));
  };
  const rebuildBody = () => {
    setDraft((d) => ({ ...d, body: bodyFor(selected) }));
    setBodyEdited(false);
  };

  const linkAndClose = async (skill: Skill) => {
    setAttachFailed(false);
    try {
      await attach.mutateAsync({ skill_id: skill.id, ids: selected.map((c) => c.id) });
      toast.success(t("modal.createdToast", { name: skill.name }));
      onClose();
    } catch {
      setAttachFailed(true); // shown inline with a Retry; the skill is already saved
    }
  };

  const save = async () => {
    if (created) return linkAndClose(created);
    if (selected.length === 0 || !v.validateAll()) return;
    try {
      const skill = await create.mutateAsync({
        ...draft,
        type: "convention",
        source: "extracted",
        evidence_files: evidenceFiles(selected),
      });
      setCreated(skill);
      await linkAndClose(skill);
    } catch (e) {
      // Other failures are toasted by the global MutationCache handler (lib/providers.tsx).
      if (e instanceof ApiError && e.status === 409) v.setServerError("name", tv("nameTaken"));
    }
  };

  const busy = create.isPending || attach.isPending;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("modal.title")}
      subtitle={t("modal.subtitle", { count: selected.length })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.spacer} />
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={save} disabled={busy || selected.length === 0}>
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
        <fieldset style={s.picker}>
          <legend style={s.pickerLegend}>
            {t("modal.selectLabel")} ·{" "}
            {t("modal.selectedCount", { selected: selected.length, total: conventions.length })}
          </legend>
          <div style={s.pickerList}>
            {conventions.map((c) => (
              <Checkbox
                key={c.id}
                checked={selectedIds.has(c.id)}
                onChange={(on) => toggle(c.id, on)}
                label={
                  <span style={s.pickerRow}>
                    <span>{c.rule}</span>
                    <span className="mono" style={s.pickerPath}>
                      {c.evidence_path}
                    </span>
                  </span>
                }
              />
            ))}
          </div>
          {selected.length === 0 && <div style={s.pickerHint}>{t("modal.noneSelected")}</div>}
          {bodyEdited && !created && (
            <Button size="sm" kind="ghost" icon="RefreshCw" onClick={rebuildBody}>
              {t("modal.rebuildBody")}
            </Button>
          )}
        </fieldset>
        <SkillDraftFields
          draft={draft}
          onChange={(p) => {
            if (p.body !== undefined) setBodyEdited(true);
            setDraft((d) => ({ ...d, ...p }));
          }}
          v={v}
          lockType
          bodyRows={16}
        />
      </div>
    </Modal>
  );
}
