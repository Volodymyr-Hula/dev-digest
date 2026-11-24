/* ImportSkillModal — import a skill from a file (.md / .zip / .skill) or a URL.
   Step 1 sends the source to the server, which parses it into a draft (nothing
   is saved). Step 2 shows the draft for editing plus warnings, ignored archive
   files and a body preview; "Import skill" creates it (untrusted, enabled). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Icon, Markdown, Modal, TextInput } from "@devdigest/ui";
import type { SkillImportPreview, SkillImportRequest } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCreateSkill, useImportSkillPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { httpsUrl, required } from "@/lib/validation";
import { useFormValidation } from "@/lib/useFormValidation";
import { EMPTY_DRAFT, SKILL_DRAFT_RULES, SkillDraftFields, type SkillDraft } from "../SkillDraftFields";
import { ACCEPT, MAX_IMPORT_BYTES, MODAL_WIDTH } from "./constants";
import { bytesToBase64, isImportableName, readFileBytes } from "./helpers";
import { s } from "./styles";

export type ImportMode = "file" | "url";

export function ImportSkillModal({ mode, onClose }: { mode: ImportMode; onClose: () => void }) {
  const t = useTranslations("skills");
  const tv = useTranslations("validation");
  const router = useRouter();
  const toast = useToast();
  const previewMut = useImportSkillPreview();
  const create = useCreateSkill();

  const [url, setUrl] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [draft, setDraft] = React.useState<SkillDraft>(EMPTY_DRAFT);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const sv = useFormValidation({ url }, { url: [required, httpsUrl] }, "import-url");
  const dv = useFormValidation(draft, SKILL_DRAFT_RULES, "import-skill");

  const pickFile = (f: File | null) => {
    setFile(f);
    if (!f) return setFileError(null);
    if (!isImportableName(f.name)) setFileError(t("import.fileType"));
    else if (f.size > MAX_IMPORT_BYTES) setFileError(t("import.fileTooLarge"));
    else setFileError(null);
  };

  const fetchPreview = async () => {
    let req: SkillImportRequest;
    if (mode === "url") {
      if (!sv.validateAll()) return;
      req = { kind: "url", url: url.trim() };
    } else {
      if (!file) return setFileError(tv("required"));
      if (fileError) return;
      req = {
        kind: "file",
        filename: file.name,
        content_base64: bytesToBase64(await readFileBytes(file)),
      };
    }
    try {
      const p = await previewMut.mutateAsync(req);
      const { source: _source, ...fields } = p.draft;
      setDraft(fields);
      setPreview(p);
      dv.reset();
      if (p.name_taken) dv.setServerError("name", tv("nameTaken"), fields.name);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t("import.fileType");
      if (mode === "url") sv.setServerError("url", msg);
      else setFileError(msg);
    }
  };

  const confirm = async () => {
    if (!preview || !dv.validateAll()) return;
    try {
      // `trusted` is omitted on purpose: the server defaults imported sources to untrusted.
      const skill = await create.mutateAsync({ ...draft, source: preview.draft.source });
      toast.success(t("import.importedToast", { name: skill.name }));
      onClose();
      router.push(`/skills/${skill.id}?tab=preview`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) dv.setServerError("name", tv("nameTaken"));
    }
  };

  const footer = preview ? (
    <div style={s.footer}>
      <Button kind="ghost" onClick={() => setPreview(null)}>
        {t("import.back")}
      </Button>
      <span style={s.spacer} />
      <Button kind="ghost" onClick={onClose}>
        {t("import.cancel")}
      </Button>
      <Button kind="primary" icon="Check" onClick={confirm} disabled={create.isPending}>
        {create.isPending ? t("import.importing") : t("import.confirm")}
      </Button>
    </div>
  ) : (
    <div style={s.footer}>
      <span style={s.spacer} />
      <Button kind="ghost" onClick={onClose}>
        {t("import.cancel")}
      </Button>
      <Button kind="primary" icon="Eye" onClick={fetchPreview} disabled={previewMut.isPending}>
        {previewMut.isPending ? t("import.fetching") : t("import.fetchPreview")}
      </Button>
    </div>
  );

  return (
    <Modal
      width={MODAL_WIDTH}
      title={mode === "url" ? t("import.titleUrl") : t("import.titleFile")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={footer}
    >
      <div style={s.body}>
        {!preview && mode === "url" && (
          <FormField label={t("import.urlLabel")} required hint={t("import.urlHint")} {...sv.fieldProps("url")}>
            <TextInput
              value={url}
              onChange={setUrl}
              mono
              placeholder={t("import.urlPlaceholder")}
              {...sv.controlProps("url")}
              onKeyDown={(e) => {
                if (e.key === "Enter") fetchPreview();
              }}
            />
          </FormField>
        )}
        {!preview && mode === "file" && (
          <FormField
            label={t("import.fileLabel")}
            required
            hint={t("import.fileHint")}
            htmlFor="import-file"
            error={fileError ?? undefined}
          >
            <div style={s.fileRow}>
              <input
                ref={fileInput}
                id="import-file"
                type="file"
                accept={ACCEPT}
                style={s.hiddenInput}
                aria-invalid={!!fileError || undefined}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              <Button kind="secondary" icon="Upload" onClick={() => fileInput.current?.click()}>
                {t("import.chooseFile")}
              </Button>
              <span className="mono" style={s.fileName}>
                {file?.name ?? t("import.noFile")}
              </span>
            </div>
          </FormField>
        )}
        {preview && (
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
            <SkillDraftFields
              draft={draft}
              onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
              v={dv}
              editBody={false}
            />
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
        )}
      </div>
    </Modal>
  );
}
