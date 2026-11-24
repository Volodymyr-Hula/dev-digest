/* ImportPreview — step 2 of the import modal: the untrusted note, server
   warnings, the editable draft (body not editable here), the archive files that
   were ignored, and the body rendered as markdown. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Markdown } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import type { useFormValidation } from "@/lib/useFormValidation";
import { SkillDraftFields, type SkillDraft } from "@/components/skill-draft-fields";
import { s } from "./styles";

export function ImportPreview({
  preview,
  draft,
  onChange,
  v,
}: {
  preview: SkillImportPreview;
  draft: SkillDraft;
  onChange: (patch: Partial<SkillDraft>) => void;
  v: ReturnType<typeof useFormValidation<SkillDraft>>;
}) {
  const t = useTranslations("skills");
  return (
    <>
      <div style={s.note}>
        <Badge color="var(--warn)">{t("preview.untrustedBadge")}</Badge>
        <span>{t("import.untrustedNote")}</span>
      </div>
      {preview.warnings.length > 0 && (
        <ul style={s.warnings} aria-label={t("import.warnings")}>
          {preview.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <SkillDraftFields draft={draft} onChange={onChange} v={v} editBody={false} />
      {preview.ignored_files.length > 0 && (
        <details style={s.ignored}>
          <summary>
            <Icon.FileText size={12} /> {t("import.ignoredFiles", { count: preview.ignored_files.length })}
          </summary>
          <ul style={s.ignoredList}>
            {preview.ignored_files.map((f) => (
              <li key={f} className="mono">
                {f}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div style={s.sectionLabel}>{t("import.bodyPreview")}</div>
      <div style={s.bodyPreview} data-testid="import-body-preview">
        <Markdown>{draft.body}</Markdown>
      </div>
    </>
  );
}
