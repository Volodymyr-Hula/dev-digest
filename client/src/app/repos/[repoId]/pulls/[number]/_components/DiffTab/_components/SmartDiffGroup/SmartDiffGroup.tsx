/* SmartDiffGroup — one role group of the Smart-order diff: a sticky, clickable
   header (colour square, label, description, "● N" files with findings, file
   count) and, when open, the group's files in a DiffViewer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { s } from "./styles";

export function SmartDiffGroup({
  label,
  description,
  color,
  files,
  findingFileCount,
  defaultOpen,
  commenting,
  findings,
}: {
  label: string;
  description: string;
  /** Colour of the role square (a CSS variable). */
  color: string;
  files: PrFile[];
  /** Number of files in this group with at least one finding; 0 hides the counter. */
  findingFileCount: number;
  defaultOpen: boolean;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
}) {
  const t = useTranslations("prReview.smartDiff");
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div style={s.wrap}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={s.header}
      >
        <Icon.ChevronRight size={13} style={s.chevron(open)} />
        <span aria-hidden style={s.square(color)} />
        <span style={s.label}>{label}</span>
        <span style={s.description}>{description}</span>
        {findingFileCount > 0 && (
          <span
            data-testid="group-finding-count"
            aria-label={t("filesWithFindings", { count: findingFileCount })}
            style={s.findingCount}
          >
            ● {findingFileCount}
          </span>
        )}
        <span style={s.filesCount}>{t("groupFiles", { count: files.length })}</span>
      </button>
      {open && <DiffViewer files={files} commenting={commenting} findings={findings} />}
    </div>
  );
}
