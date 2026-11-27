/* IntentSources — what the intent was derived from: kind, reference, a status
   (icon + label, never colour alone), the doc version used ("PR head" /
   "default branch") and a short hint for sources that were not read. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { IntentSource } from "@devdigest/shared";
import { HINTED_STATUSES, SOURCE_STATUS_ICON } from "./constants";
import { s } from "./styles";

export function IntentSources({ sources }: { sources: IntentSource[] }) {
  const t = useTranslations("prIntent");
  if (sources.length === 0) return null;

  return (
    <ul data-testid="intent-sources" aria-label={t("sources.title")} style={s.list}>
      {sources.map((src, i) => {
        const st = SOURCE_STATUS_ICON[src.status];
        const I = Icon[st.icon];
        return (
          <li
            key={`${src.kind}:${src.ref}:${i}`}
            data-testid="intent-source"
            data-kind={src.kind}
            data-status={src.status}
            style={s.item}
          >
            <div style={s.row}>
              <I size={14} style={{ color: st.color }} />
              <span style={s.kind}>{t(`sources.kind.${src.kind}`)}</span>
              <span className="mono" style={s.ref}>
                {src.ref}
              </span>
              <span data-testid="intent-source-status" style={{ ...s.tag, color: st.color }}>
                {t(`sources.status.${src.status}`)}
              </span>
              {src.version && (
                <span data-testid="intent-source-version" style={s.tag}>
                  {t(`sources.version.${src.version}`)}
                </span>
              )}
              {src.role && <span style={s.tag}>{t(`sources.role.${src.role}`)}</span>}
            </div>
            {HINTED_STATUSES.has(src.status) && (
              <div data-testid="intent-source-hint" style={s.hint}>
                {t(`sources.hint.${src.status as "not_found" | "referenced_not_fetched" | "skipped_pull_request"}`)}
                {src.reason ? ` (${src.reason})` : ""}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
