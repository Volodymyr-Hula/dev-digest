/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored finding cards and comment threads, and an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard, SEV_COLOR, SEV_COLOR_FALLBACK } from "@/components/finding-card";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { SEVERITY_LINE_LABEL_KEY } from "../constants";
import { topSeverity, type DiffFindingApi } from "../findings";
import { s, lineRowFor, lineSignFor, lineBar, lineSevLabel, findingRail } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

/** Right-hand severity label; its own component so the message namespace is read only when a line hosts a finding. */
function SeverityLineLabel({ severity, color }: { severity: string; color: string }) {
  const t = useTranslations("prReview.smartDiff");
  const key = SEVERITY_LINE_LABEL_KEY[severity];
  if (!key) return null;
  return (
    <span data-testid="line-sev-label" style={lineSevLabel(color)}>
      {t(key)}
    </span>
  );
}

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings = [],
  findingApi,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Findings anchored to this line (new side). */
  findings?: FindingRecord[];
  findingApi?: DiffFindingApi;
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const showFindings = !!findingApi && findingApi.showFindings && findings.length > 0;
  const sev = showFindings ? topSeverity(findings) : null;
  const sevColor = sev ? (SEV_COLOR[sev] ?? SEV_COLOR_FALLBACK) : null;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={sevColor ? { ...lineRowFor(ln.kind), ...lineBar(sevColor) } : lineRowFor(ln.kind)}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {sev && sevColor && <SeverityLineLabel severity={sev} color={sevColor} />}
      </div>

      {showFindings && findingApi && (
        <div style={findingRail}>
          {findings.map((f) => (
            <FindingCard
              key={f.id}
              f={f}
              defaultExpanded
              pending={findingApi.pendingId === f.id}
              onAction={(action) => findingApi.onAction(f.id, action)}
              repoFullName={findingApi.repoFullName}
              headSha={findingApi.headSha}
            />
          ))}
        </div>
      )}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
