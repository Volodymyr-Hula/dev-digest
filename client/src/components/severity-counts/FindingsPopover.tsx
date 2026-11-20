/* FindingsPopover — floating "N FINDINGS" preview of the most severe findings.
   Portalled to <body> with fixed positioning so `overflow: hidden` on table
   rows / run cards can't clip it. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  ConfidenceNum,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { lineLabel, sortBySeverity } from "@/lib/findings";
import { POPOVER_MAX_ITEMS, POPOVER_WIDTH } from "./constants";
import { s } from "./styles";

const ACCENT: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
};

/** Rationales use `inline code` for identifiers — keep it readable in the preview. */
function formatRationale(text: string): string {
  return text.replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function FindingsPopover({
  anchor,
  findings,
  onMouseEnter,
  onMouseLeave,
}: {
  anchor: HTMLElement;
  /** undefined while loading. */
  findings: FindingRecord[] | undefined;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const t = useTranslations("prReview");
  const rect = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
  const live = findings ? sortBySeverity(findings.filter((f) => !f.dismissed_at)) : undefined;
  const shown = live?.slice(0, POPOVER_MAX_ITEMS) ?? [];
  const more = (live?.length ?? 0) - shown.length;

  return createPortal(
    <div
      role="tooltip"
      style={s.popover(rect.bottom + 6, left, POPOVER_WIDTH)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={s.header}>
        <Icon.AlertOctagon size={12} />
        {live ? t("severity.popoverTitle", { count: live.length }) : t("severity.loading")}
      </div>
      {shown.map((f, i) => (
        <div
          key={f.id}
          style={{
            ...s.item(i === shown.length - 1 && more <= 0),
            borderLeft: `2px solid ${ACCENT[f.severity] ?? "var(--border)"}`,
            paddingLeft: 8,
          }}
        >
          <div style={s.titleRow}>
            <SeverityBadge severity={f.severity as Severity} compact />
            <span style={s.title}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
          </div>
          <div style={s.metaRow}>
            <span className="mono" style={s.file}>
              {f.file}:{lineLabel(f)}
            </span>
            <ConfidenceNum value={f.confidence} />
          </div>
          <div style={s.rationale} dangerouslySetInnerHTML={{ __html: formatRationale(f.rationale) }} />
        </div>
      ))}
      {more > 0 && <div style={s.muted}>{t("severity.more", { count: more })}</div>}
    </div>,
    document.body,
  );
}
