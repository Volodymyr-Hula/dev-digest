/* ConventionsView — header (stats, Run extraction / Re-scan, Accept as Skill),
   scan state, and the conventions grouped into To review / Accepted / In skills /
   Rejected. The list polls while a scan job is queued or running. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { ConventionCandidate, UpdateConventionInput } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import {
  isScanActive,
  useConventions,
  useStartConventionsScan,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ConventionCard } from "./_components/ConventionCard";
import { ConventionSkillModal } from "./_components/ConventionSkillModal";
import { SECTIONS } from "./constants";
import { emptyKind, groupConventions, scanError, type EmptyKind } from "./helpers";
import { s } from "./styles";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const { repos } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const start = useStartConventionsScan(repoId);
  const update = useUpdateConvention(repoId);
  const [modalOpen, setModalOpen] = React.useState(false);

  const repoName = repos.find((r) => r.id === repoId)?.full_name ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const scanning = start.isPending || isScanActive(data);
  const items = data?.items ?? [];
  const groups = groupConventions(items);
  const failure = scanError(data?.scan);

  // Mutation failures are toasted by the global MutationCache handler (lib/providers.tsx).
  const runScan = () => start.mutate(undefined);
  /** Resolves false on failure so an inline edit stays open with the user's text. */
  const patch = (c: ConventionCandidate, p: UpdateConventionInput) =>
    update.mutateAsync({ id: c.id, patch: p }).then(
      () => true,
      () => false,
    );

  return (
    <AppShell crumb={crumb}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>
            {t("page.headingPrefix")}
            <span className="mono">{repoName}</span>
          </h1>
          <p style={s.pageSubtitle}>{t("page.subtitle")}</p>
          {data && (
            <p style={s.stats} data-testid="conventions-stats">
              {t("page.stats", {
                accepted: data.stats.accepted,
                rejected: data.stats.rejected,
                inSkills: data.stats.in_skills,
              })}
            </p>
          )}
        </div>
        <div style={s.headerActions}>
          {items.length > 0 && (
            <Button icon="RefreshCw" onClick={runScan} disabled={scanning} loading={scanning}>
              {scanning ? t("page.scanning") : t("page.rescan")}
            </Button>
          )}
          <Button
            kind="primary"
            icon="Sparkles"
            onClick={() => setModalOpen(true)}
            disabled={groups.accepted.length === 0}
          >
            {groups.accepted.length > 0
              ? t("page.acceptAsSkillCount", { count: groups.accepted.length })
              : t("page.acceptAsSkill")}
          </Button>
        </div>
      </div>

      <div style={s.content}>
        {failure && !scanning && items.length > 0 && (
          <div role="alert" style={s.error}>
            <Icon.AlertTriangle size={14} style={s.errorIcon} />
            <div>
              <div>{t(`page.failed.codes.${failure.code}`)}</div>
              {failure.detail && <div style={s.errorDetail}>{t("page.failed.details", { error: failure.detail })}</div>}
            </div>
          </div>
        )}

        {isLoading ? (
          <div style={s.loadingStack}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height={96} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState title={t("page.loadError")} onRetry={() => refetch()} retryLabel={t("page.failed.retry")} />
        ) : items.length === 0 ? (
          <EmptyPage
            kind={scanning ? "never" : emptyKind(data?.scan)}
            failure={failure}
            scanning={scanning}
            onScan={runScan}
          />
        ) : (
          SECTIONS.filter((k) => groups[k].length > 0).map((k) => (
            <section key={k} style={s.section} aria-label={t(`page.sections.${k}`)}>
              <div style={s.sectionLabel}>
                {t(`page.sections.${k}`)} · {groups[k].length}
              </div>
              {groups[k].map((c) => (
                <ConventionCard
                  key={c.id}
                  c={c}
                  onPatch={(p) => patch(c, p)}
                  pending={update.isPending && update.variables?.id === c.id}
                />
              ))}
            </section>
          ))
        )}
      </div>

      {modalOpen && (
        <ConventionSkillModal
          repoId={repoId}
          repoName={repoName}
          conventions={groups.accepted}
          onClose={() => setModalOpen(false)}
        />
      )}
    </AppShell>
  );
}

/** No conventions yet: never scanned (or scanning), scanned with nothing new, or the scan failed. */
function EmptyPage({
  kind,
  failure,
  scanning,
  onScan,
}: {
  kind: EmptyKind;
  failure: ReturnType<typeof scanError>;
  scanning: boolean;
  onScan: () => void;
}) {
  const t = useTranslations("conventions");
  if (kind === "failed" && failure) {
    return (
      <ErrorState
        title={t("page.failed.title")}
        body={
          <>
            {t(`page.failed.codes.${failure.code}`)}
            {failure.detail && <span style={s.errorDetail}>{t("page.failed.details", { error: failure.detail })}</span>}
          </>
        }
        onRetry={onScan}
        retryLabel={t("page.failed.retry")}
      />
    );
  }
  const key = kind === "noneFound" ? "noneFound" : "empty";
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
