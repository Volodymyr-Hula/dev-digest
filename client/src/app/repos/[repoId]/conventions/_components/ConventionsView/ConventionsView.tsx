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
import { ApiError } from "@/lib/api";
import {
  isScanActive,
  useConventions,
  useStartConventionsScan,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { ConventionCard } from "./_components/ConventionCard";
import { ConventionSkillModal } from "./_components/ConventionSkillModal";
import { groupConventions, scanError } from "./helpers";
import { s } from "./styles";

const SECTIONS = ["pending", "accepted", "inSkills", "rejected"] as const;

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const toast = useToast();
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

  const runScan = () =>
    start.mutate(undefined, {
      onError: (e) => toast.error(e instanceof ApiError ? e.message : t("page.extractionFailed")),
    });
  const patch = (c: ConventionCandidate, p: UpdateConventionInput) =>
    update.mutateAsync({ id: c.id, patch: p }).catch((e) => {
      toast.error(e instanceof ApiError ? e.message : t("card.updateFailed"));
    });

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
        {failure && !scanning && (
          <div role="alert" style={s.error}>
            <Icon.AlertTriangle size={14} />
            {failure.interrupted ? t("page.interrupted") : `${t("page.extractionFailed")}: ${failure.message}`}
          </div>
        )}

        {isLoading ? (
          <div style={s.loadingStack}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height={96} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState title={t("page.loadError")} onRetry={() => refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={scanning ? t("page.scanning") : t("page.empty.cta")}
            onCta={scanning ? undefined : runScan}
            ctaLoading={scanning}
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
