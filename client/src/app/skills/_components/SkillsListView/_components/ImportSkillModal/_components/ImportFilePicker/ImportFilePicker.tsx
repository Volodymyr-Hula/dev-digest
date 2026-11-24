/* ImportFilePicker — the "Skill file" field of the import modal: a hidden file
   input behind a button, the chosen name, and the field error. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField } from "@devdigest/ui";
import { s } from "./styles";

export function ImportFilePicker({
  accept,
  file,
  error,
  onPick,
}: {
  accept: string;
  file: File | null;
  error: string | null;
  onPick: (f: File | null) => void;
}) {
  const t = useTranslations("skills");
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <FormField
      label={t("import.fileLabel")}
      required
      hint={t("import.fileHint")}
      htmlFor="import-file"
      error={error ?? undefined}
    >
      <div style={s.fileRow}>
        <input
          ref={input}
          id="import-file"
          type="file"
          accept={accept}
          style={s.hiddenInput}
          aria-invalid={!!error || undefined}
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
        <Button kind="secondary" icon="Upload" onClick={() => input.current?.click()}>
          {t("import.chooseFile")}
        </Button>
        <span className="mono" style={s.fileName}>
          {file?.name ?? t("import.noFile")}
        </span>
      </div>
    </FormField>
  );
}
