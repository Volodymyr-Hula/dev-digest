/* ConventionsBody — the conventions page below the header, one state at a time:
   loading, load error, no conventions (never scanned / nothing new / scan
   failed), or the sections with a banner for a failed re-scan. Presentational:
   ConventionsView computes the groups and the scan state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { ConventionCandidate, ConventionScanErrorCode, UpdateConventionInput } from "@devdigest/shared";
import { ConventionCard } from "../ConventionCard";
import { SECTIONS, type SectionKey } from "./constants";
import { s } from "./styles";

export interface ScanFailure {
  code: ConventionScanErrorCode;
  detail: string | null;
}

/** The conventions query as the body needs it. */
export interface ConventionsLoad {
  isLoading: boolean;
  isError: boolean;
  reload: () => void;
}

/** The scan as the body needs it. */
export interface ConventionsScan {
  /** What to show when there are no conventions. */
  empty: "never" | "noneFound" | "failed";
  failure: ScanFailure | null;
  scanning: boolean;
  start: () => void;
}

/** Card actions: `patch` resolves false on failure; `pendingId` is the card being saved. */
export interface ConventionsEdit {
  patch: (c: ConventionCandidate, p: UpdateConventionInput) => Promise<boolean>;
  pendingId: string | undefined;
}

export function ConventionsBody({
  load,
  scan,
  groups,
  edit,
}: {
  load: ConventionsLoad;
  scan: ConventionsScan;
  groups: Record<SectionKey, ConventionCandidate[]>;
  edit: ConventionsEdit;
}) {
  const t = useTranslations("conventions");
  const { empty, failure, scanning, start: onScan } = scan;

  if (load.isLoading) {
    return (
      <div style={s.loadingStack}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} height={96} />
        ))}
      </div>
    );
  }
  if (load.isError) {
    return <ErrorState title={t("page.loadError")} onRetry={load.reload} retryLabel={t("page.failed.retry")} />;
  }

  const sections = SECTIONS.filter((k) => groups[k].length > 0);
  const failureText = failure && (
    <>
      {t(`page.failed.codes.${failure.code}`)}
      {failure.detail && <span style={s.errorDetail}>{t("page.failed.details", { error: failure.detail })}</span>}
    </>
  );

  if (sections.length === 0) {
    if (!scanning && empty === "failed" && failure) {
      return (
        <ErrorState title={t("page.failed.title")} body={failureText} onRetry={onScan} retryLabel={t("page.failed.retry")} />
      );
    }
    const key = !scanning && empty === "noneFound" ? "noneFound" : "empty";
    return (
      <EmptyState
        icon="ListChecks"
        title={t(`page.${key}.title`)}
        body={t(`page.${key}.body`)}
        cta={scanning ? t("page.scanning") : t(`page.${key}.cta`)}
        onCta={scanning ? undefined : onScan}
        ctaLoading={scanning}
      />
    );
  }

  return (
    <>
      {failure && !scanning && (
        <div role="alert" style={s.error}>
          <Icon.AlertTriangle size={14} style={s.errorIcon} />
          <div>{failureText}</div>
        </div>
      )}
      {sections.map((k) => (
        <section key={k} style={s.section} aria-label={t(`page.sections.${k}`)}>
          <div style={s.sectionLabel}>
            {t(`page.sections.${k}`)} · {groups[k].length}
          </div>
          {groups[k].map((c) => (
            <ConventionCard key={c.id} c={c} onPatch={(p) => edit.patch(c, p)} pending={edit.pendingId === c.id} />
          ))}
        </section>
      ))}
    </>
  );
}
