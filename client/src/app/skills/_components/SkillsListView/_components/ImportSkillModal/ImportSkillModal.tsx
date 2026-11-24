/* ImportSkillModal — import a skill from a file (.md / .zip / .skill) or a URL.
   Step 1 sends the source to the server, which parses it into a draft (nothing
   is saved). Step 2 shows the draft for editing plus warnings, ignored archive
   files and a body preview; "Import skill" creates it (untrusted, enabled). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput } from "@devdigest/ui";
import type { SkillImportPreview, SkillImportRequest } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCreateSkill, useImportSkillPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { httpsUrl, required } from "@/lib/validation";
import { useFormValidation } from "@/lib/useFormValidation";
import { EMPTY_DRAFT, SKILL_DRAFT_RULES, type SkillDraft } from "@/components/skill-draft-fields";
import { ACCEPT, MAX_IMPORT_BYTES, MODAL_WIDTH } from "./constants";
import { bytesToBase64, isImportableName, readFileBytes } from "./helpers";
import { ImportFilePicker } from "./_components/ImportFilePicker";
import { ImportPreview } from "./_components/ImportPreview";
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
    if (mode === "url" && !sv.validateAll()) return;
    if (mode === "file") {
      if (!file) return setFileError(tv("required"));
      if (fileError) return;
    }
    try {
      const req: SkillImportRequest =
        mode === "url"
          ? { kind: "url", url: url.trim() }
          : { kind: "file", filename: file!.name, content_base64: bytesToBase64(await readFileBytes(file!)) };
      const p = await previewMut.mutateAsync(req);
      const { source: _source, ...fields } = p.draft;
      setDraft(fields);
      setPreview(p);
      dv.reset();
      if (p.name_taken) dv.setServerError("name", tv("nameTaken"), fields.name);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t("import.previewFailed");
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
      else toast.error(e instanceof ApiError ? e.message : t("import.saveFailed"));
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
          <ImportFilePicker accept={ACCEPT} file={file} error={fileError} onPick={pickFile} />
        )}
        {preview && (
          <ImportPreview preview={preview} draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} v={dv} />
        )}
      </div>
    </Modal>
  );
}
