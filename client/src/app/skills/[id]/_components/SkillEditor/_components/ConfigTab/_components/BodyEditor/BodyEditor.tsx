/* BodyEditor — markdown body with a line-number gutter, file-name bar,
   "unsaved" marker and a ~token estimate. The textarea grows to fit its
   lines, so the gutter and text scroll together in one container. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { approxTokens } from "../../helpers";
import { s, textareaHeight } from "./styles";

export function BodyEditor({
  fileName,
  value,
  onChange,
  dirty,
  id,
  invalid,
  onBlur,
  "aria-describedby": describedBy,
}: {
  fileName: string;
  value: string;
  onChange: (v: string) => void;
  dirty: boolean;
  id?: string;
  invalid?: boolean;
  onBlur?: () => void;
  "aria-describedby"?: string;
}) {
  const t = useTranslations("skills");
  const lines = Math.max(value.split("\n").length, 1);
  return (
    <div style={invalid ? { ...s.frame, border: "1px solid var(--crit)" } : s.frame}>
      <div style={s.bar}>
        <Icon.FileText size={13} />
        <span className="mono">{fileName}</span>
        {dirty && <span style={s.unsaved}>{t("config.unsaved")}</span>}
        <span style={s.tokens} className="tnum" data-testid="skill-token-count">
          {t("config.tokens", { count: approxTokens(value) })}
        </span>
      </div>
      <div style={s.scroll}>
        <pre className="mono" style={s.gutter} aria-hidden>
          {Array.from({ length: lines }, (_, i) => i + 1).join("\n")}
        </pre>
        <textarea
          className="mono"
          id={id}
          aria-label={t("config.body")}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onBlur={onBlur}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={lines}
          wrap="off"
          spellCheck={false}
          style={{ ...s.textarea, height: textareaHeight(lines) }}
        />
      </div>
    </div>
  );
}
