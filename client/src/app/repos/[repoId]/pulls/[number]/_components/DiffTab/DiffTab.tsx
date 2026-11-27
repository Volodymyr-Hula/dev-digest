/* DiffTab — Files changed. Smart order (default) groups the files by role with
   the agents' findings inline; Original order is the flat GitHub-order list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Button, Skeleton, ErrorState } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { selectLatestFindings } from "@/lib/findings";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { ROLE_META, DEFAULT_COLLAPSED_ROLES } from "./constants";
import { toGroupedFiles, filesWithFindings } from "./helpers";
import { SmartDiffGroup } from "./_components/SmartDiffGroup";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** Used to build github.com links on finding cards. */
  repoFullName?: string | null;
  headSha?: string | null;
}

type Order = "smart" | "original";

export function DiffTab({ prId, files, canComment, repoFullName, headSha }: DiffTabProps) {
  const t = useTranslations("prReview.smartDiff");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: reviews } = usePrReviews(prId);
  const smartDiff = useSmartDiff(prId);
  const findingAction = useFindingAction();
  const [order, setOrder] = React.useState<Order>("smart");
  // null = follow the default (shown when findings exist); a click overrides it for the session.
  const [annotationsOverride, setAnnotationsOverride] = React.useState<boolean | null>(null);

  const selected = React.useMemo(() => selectLatestFindings(reviews ?? []), [reviews]);
  const reviewed = (reviews ?? []).some((r) => r.kind === "review");
  const commentCount = comments?.length ?? 0;
  const annotationCount = commentCount + selected.length;
  const showAnnotations = annotationsOverride ?? selected.length > 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments: showAnnotations,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setAnnotationsOverride(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const findingApi: DiffFindingApi = {
    findings: selected,
    showFindings: showAnnotations,
    onAction: (findingId, action) => findingAction.mutate({ findingId, action, prId: prId ?? undefined }),
    pendingId: findingAction.isPending ? (findingAction.variables?.findingId ?? null) : null,
    repoFullName,
    headSha,
  };

  const groups = React.useMemo(
    () => (smartDiff.data ? toGroupedFiles(smartDiff.data.groups, files) : []),
    [smartDiff.data, files],
  );
  const additions = files.reduce((n, f) => n + (f.additions ?? 0), 0);
  const deletions = files.reduce((n, f) => n + (f.deletions ?? 0), 0);

  return (
    <section>
      <div style={s.headerRow}>
        <div style={s.title}>
          <Icon.Code size={14} />
          <span style={s.titleText}>{t("reviewerOrdered")}</span>
          <span className="mono tnum" style={s.summary}>
            {t("summary", { files: files.length, additions, deletions })}
          </span>
        </div>
        <div style={s.controls}>
          <div role="group" style={s.segmented}>
            <button
              type="button"
              aria-pressed={order === "smart"}
              onClick={() => setOrder("smart")}
              style={s.segment(order === "smart")}
            >
              {t("smartOrder")}
            </button>
            <button
              type="button"
              aria-pressed={order === "original"}
              onClick={() => setOrder("original")}
              style={s.segment(order === "original")}
            >
              {t("originalOrder")}
            </button>
          </div>
          {annotationCount > 0 && (
            <Button
              kind="ghost"
              size="sm"
              icon={showAnnotations ? "EyeOff" : "Eye"}
              onClick={() => setAnnotationsOverride(!showAnnotations)}
            >
              {showAnnotations ? t("hideAnnotations") : t("showAnnotations")} ({annotationCount})
            </Button>
          )}
        </div>
      </div>

      {order === "smart" && !reviewed && files.length > 0 && <div style={s.notReviewed}>{t("notReviewed")}</div>}

      {order === "original" || files.length === 0 ? (
        <DiffViewer files={files} commenting={commenting} findings={findingApi} />
      ) : smartDiff.isError ? (
        <ErrorState
          title={t("loadError")}
          onRetry={() => smartDiff.refetch()}
          retryLabel={t("retry")}
        />
      ) : smartDiff.isLoading || !smartDiff.data ? (
        <Skeleton height={160} />
      ) : (
        <div data-testid="smart-diff-groups" style={s.groups}>
          {groups
            .filter((g) => g.files.length > 0)
            .map((g) => {
              const meta = ROLE_META[g.role];
              return (
                <SmartDiffGroup
                  key={g.role}
                  label={t(meta.labelKey)}
                  description={t(meta.descriptionKey)}
                  color={meta.color}
                  files={g.files}
                  findingFileCount={reviewed ? filesWithFindings(g.files, selected) : 0}
                  defaultOpen={!DEFAULT_COLLAPSED_ROLES.includes(g.role)}
                  commenting={commenting}
                  findings={findingApi}
                />
              );
            })}
        </div>
      )}
    </section>
  );
}
