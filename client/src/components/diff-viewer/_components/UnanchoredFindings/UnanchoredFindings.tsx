/* UnanchoredFindings — footer block for findings whose line isn't rendered in
   this file's patch (or the file has no patch). Same look as OutdatedComments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card";
import { cs } from "@/components/diff-viewer/comments";
import type { DiffFindingApi } from "@/components/diff-viewer/findings";

export function UnanchoredFindings({
  findings,
  api,
}: {
  findings: FindingRecord[];
  api: DiffFindingApi;
}) {
  const t = useTranslations("prReview.smartDiff");
  if (findings.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>{t("unanchoredTitle")}</span>
      {findings.map((f) => (
        <FindingCard
          key={f.id}
          f={f}
          pending={api.pendingId === f.id}
          onAction={(action) => api.onAction(f.id, action)}
          repoFullName={api.repoFullName}
          headSha={api.headSha}
        />
      ))}
    </div>
  );
}
