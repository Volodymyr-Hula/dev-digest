/* ConventionsView — header (stats, Run extraction / Re-scan, Accept as Skill),
   scan state, and the conventions grouped into To review / Accepted / In skills /
   Rejected. The list polls while a scan job is queued or running. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
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
import { ConventionsBody } from "./_components/ConventionsBody";
import { ConventionSkillModal } from "./_components/ConventionSkillModal";
import { emptyKind, groupConventions, scanError } from "./helpers";
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
            <p style={s.stats}>
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
        <ConventionsBody
          load={{ isLoading, isError, reload: () => refetch() }}
          scan={{ empty: emptyKind(data?.scan), failure, scanning, start: runScan }}
          groups={groups}
          edit={{ patch, pendingId: update.isPending ? update.variables?.id : undefined }}
        />
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
